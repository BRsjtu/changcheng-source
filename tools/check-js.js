const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const skip = new Set(['node_modules', '.git', 'tmp'])
const files = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full)
    }
  }
}

walk(root)

let failed = false
for (const file of files) {
  try {
    new Function(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    failed = true
    console.error(`Syntax error in ${path.relative(root, file)}`)
    console.error(err.stack || err.message)
  }
}

if (failed) process.exit(1)

const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
for (const page of appJson.pages || []) {
  for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
    const pageFile = path.join(root, `${page}${ext}`)
    if (!fs.existsSync(pageFile)) {
      console.error(`Missing page file: ${page}${ext}`)
      failed = true
    }
  }
}

for (const tab of (appJson.tabBar && appJson.tabBar.list) || []) {
  for (const key of ['iconPath', 'selectedIconPath']) {
    const asset = path.join(root, tab[key])
    if (!fs.existsSync(asset)) {
      console.error(`Missing tab asset: ${tab[key]}`)
      failed = true
    }
  }
}

for (const marker of ['assets/marker.png', 'assets/marker-active.png']) {
  if (!fs.existsSync(path.join(root, marker))) {
    console.error(`Missing marker asset: ${marker}`)
    failed = true
  }
}

if (failed) process.exit(1)
console.log(`Checked ${files.length} JavaScript files and ${appJson.pages.length} mini program pages.`)
