const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

function createHarness({ states, uploadFails = false } = {}) {
  let app
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), {
    App(value) { app = value }
  })
  const requests = []
  const reads = []
  const remaining = (states || [{ status: 'complete', data: { imageUrl: 'https://example.test/output.png' } }]).slice()
  const sandbox = {
    module: { exports: {} },
    getApp: () => app,
    require() {
      return {
        getMimeTypeFromPath: () => 'image/jpeg',
        async readImageBase64(candidates) {
          reads.push(candidates)
          return { imageBase64: 'cmVmZXJlbmNl', mimeType: 'image/jpeg' }
        }
      }
    },
    console: { warn() {} },
    setTimeout(callback) { queueMicrotask(callback); return 1 },
    clearTimeout() {},
    wx: {
      uploadFile(options) {
        if (uploadFails) options.fail({ errMsg: 'uploadFile:fail' })
        else options.success({ statusCode: 200, data: JSON.stringify({ ok: true, data: { uploadId: 'reference-id' } }) })
        return { abort() {} }
      },
      request(options) {
        requests.push(options)
        if (options.method === 'POST') {
          options.success({ statusCode: 200, data: { ok: true, data: { jobId: 'job-id' } } })
        } else {
          const state = remaining.shift()
          assert.ok(state, 'unexpected repeated polling')
          if (state.httpError) options.success({ statusCode: state.httpError, data: { ok: false, error: state.error } })
          else options.success({ statusCode: 200, data: { ok: true, data: state } })
        }
        return { abort() {} }
      }
    }
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'utils', 'ai.js'), 'utf8'), sandbox)
  return { ai: sandbox.module.exports, requests, reads }
}

function creationInput(extra = {}) {
  return { site: { name: '长城墩台', story: '府谷明长城的历史' }, designType: '冰箱贴', note: '', ...extra }
}

test('text generation sends Flare medium and returns the image', async () => {
  const { ai, requests } = createHarness()
  const result = await ai.generateCreation(creationInput())
  assert.equal(result.imageUrl, 'https://example.test/output.png')
  assert.equal(requests[0].data.model, 'gpt-image-2.5-flare')
  assert.equal(requests[0].data.quality, 'medium')
  assert.equal(requests[0].data.aspectRatio, '1:1')
  assert.equal(requests[0].data.path, undefined)
})

test('a failed image job stops polling and does not trigger image upload fallback', async () => {
  const rawError = '上游接口请求失败。status=503 detail=no available channels'
  const { ai, requests, reads } = createHarness({ states: [{ status: 'failed', error: rawError }] })
  await assert.rejects(ai.generateCreation(creationInput({ imageRefs: [{ filePath: '/photo.jpg', candidates: ['/saved.jpg', '/photo.jpg'] }] })), { message: rawError })
  assert.equal(requests.filter((item) => item.method === 'POST').length, 1)
  assert.equal(requests.filter((item) => item.method === 'GET').length, 1)
  assert.equal(requests[0].data.imageIds[0], 'reference-id')
  assert.equal(reads.length, 0)
})

test('only reference upload failures use base64 fallback and keep all photos', async () => {
  const { ai, requests, reads } = createHarness({ uploadFails: true })
  await ai.generateCreation(creationInput({ imageRefs: [
    { filePath: '/photo1.jpg', candidates: ['/saved1.jpg', '/photo1.jpg'] },
    { filePath: '/photo2.jpg', candidates: ['/saved2.jpg', '/photo2.jpg'] }
  ] }))
  assert.equal(reads.length, 2)
  assert.equal(reads[1][0], '/saved2.jpg')
  assert.equal(requests[0].data.images.length, 2)
  assert.equal(requests[0].data.imageIds, undefined)
  assert.equal(requests[0].data.model, 'gpt-image-2.5-flare')
})

test('polling transport errors retry the same job without creating another one', async () => {
  const { ai, requests } = createHarness({ states: [
    { httpError: 503, error: '网关暂不可用。status=503' },
    { status: 'complete', data: { imageUrl: 'https://example.test/recovered.png' } }
  ] })
  const result = await ai.generateCreation(creationInput({ designType: '手机壁纸' }))
  assert.equal(result.imageUrl, 'https://example.test/recovered.png')
  assert.equal(requests[0].data.aspectRatio, '9:16')
  assert.equal(requests.filter((item) => item.method === 'POST').length, 1)
  assert.equal(requests.filter((item) => item.method === 'GET').length, 2)
})

test('invalid request errors stop immediately and remain available for diagnosis', async () => {
  const rawError = 'OpenAI 格式接口请求失败。status=400 detail={"error":{"message":"Unknown parameter: path. (request id: test-request-123)","code":"unknown_parameter"}}'
  const { ai, requests } = createHarness({ states: [{ httpError: 400, error: rawError }] })
  await assert.rejects(ai.generateCreation(creationInput()), { message: rawError })
  assert.equal(requests.length, 2)
  assert.equal(ai.getCreationErrorMessage(new Error(rawError)), '生图服务暂时异常，请稍后重新生成。\n错误编号：test-request-123')
})
