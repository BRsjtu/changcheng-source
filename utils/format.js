function formatTime(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function recordTitle(record) {
  if (record.kind === 'patrol') return '巡检'
  if (record.kind === 'story') return '守护记录'
  return '打卡'
}

function localDateKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

module.exports = {
  formatTime,
  localDateKey,
  recordTitle
}
