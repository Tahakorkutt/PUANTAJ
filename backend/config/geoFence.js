const OFFICE_LOCATION = {
  // Atatürk Organize Sanayi Bölgesi (AOSB / Çiğli) merkezi
  latitude: 38.4907953,
  longitude: 27.0383003,
  radiusMeters: 3000,
  address: 'Küçük Çiğli, Anadolu Cd. No:1163, 35620 Aosb/Çiğli/İzmir',
}

const toRadians = (degrees) => (degrees * Math.PI) / 180

const getDistanceInMeters = (fromLat, fromLon, toLat, toLon) => {
  const earthRadius = 6371000
  const dLat = toRadians(toLat - fromLat)
  const dLon = toRadians(toLon - fromLon)
  const lat1 = toRadians(fromLat)
  const lat2 = toRadians(toLat)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadius * c
}

const assertWithinOfficeRadius = ({ latitude, longitude, accuracy = 0 }) => {
  if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
    throw new Error('Konum bilgisi zorunludur. Tarayıcıdan konum izni verin.')
  }

  const lat = Number(latitude)
  const lon = Number(longitude)
  const gpsAccuracy = Math.max(0, Number(accuracy) || 0)

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    throw new Error('Geçersiz konum bilgisi.')
  }

  const distance = getDistanceInMeters(
    lat,
    lon,
    OFFICE_LOCATION.latitude,
    OFFICE_LOCATION.longitude,
  )

  // GPS hata payını düşerek gerçek mesafeyi daha adil hesapla
  const adjustedDistance = Math.max(0, distance - gpsAccuracy)
  const allowedRadius = OFFICE_LOCATION.radiusMeters

  if (adjustedDistance > allowedRadius) {
    throw new Error(
      `Puantaj için ofis alanında olmalısınız. (${OFFICE_LOCATION.address}) Yaklaşık ${Math.round(distance)} m uzaktasınız; izin verilen yarıçap ${allowedRadius} m. Konumunuz: ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
    )
  }

  return {
    distanceMeters: Math.round(distance),
    withinRadius: true,
  }
}

export { OFFICE_LOCATION, getDistanceInMeters, assertWithinOfficeRadius }
