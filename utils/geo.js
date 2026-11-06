function toRad(value) {
  return (Number(value) * Math.PI) / 180
}

function distanceMeters(a, b) {
  if (!a || !b) return 0
  const radius = 6371000
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return Math.round(2 * radius * Math.asin(Math.sqrt(h)))
}

function formatDistance(meters) {
  if (!meters) return '未定位'
  if (meters < 1000) return `${meters} 米`
  return `${(meters / 1000).toFixed(1)} 公里`
}

module.exports = {
  distanceMeters,
  formatDistance
}
