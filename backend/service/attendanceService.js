import { createAttendanceLog, getAttendanceByUsername, hasAttendanceActionToday } from '../models/Attendance.js'
import { assertWithinOfficeRadius } from '../config/geoFence.js'

const qrCodeMap = {
  'PUANTAJ-GIRIS-2026': 'checkin',
  'PUANTAJ-CIKIS-2026': 'checkout',
}

const resolveQrAction = (qrCode) => {
  if (!qrCode) {
    return null
  }

  const normalized = String(qrCode).trim().toUpperCase()
  return qrCodeMap[normalized] || null
}

const handleAttendanceAction = async ({
  username,
  action,
  qrCode,
  source = 'camera',
  note = '',
  latitude,
  longitude,
  accuracy = 0,
}) => {
  if (!username) {
    throw new Error('Kullanıcı adı zorunludur.')
  }

  const locationCheck = assertWithinOfficeRadius({ latitude, longitude, accuracy })
  const resolvedAction = action || resolveQrAction(qrCode)

  if (!resolvedAction) {
    throw new Error('Geçersiz QR kodu. Giriş veya çıkış QR kodunu okutun.')
  }

  if (!['checkin', 'checkout'].includes(resolvedAction)) {
    throw new Error('Geçersiz işlem tipi. Kullanım: checkin veya checkout')
  }

  const alreadyDoneToday = await hasAttendanceActionToday(username, resolvedAction)
  if (alreadyDoneToday) {
    throw new Error(
      resolvedAction === 'checkin'
        ? 'Bugün için giriş kaydınız zaten alınmış. Günde yalnızca bir kez giriş yapabilirsiniz.'
        : 'Bugün için çıkış kaydınız zaten alınmış. Günde yalnızca bir kez çıkış yapabilirsiniz.',
      )
  }

  if (resolvedAction === 'checkout') {
    const hasCheckinToday = await hasAttendanceActionToday(username, 'checkin')
    if (!hasCheckinToday) {
      throw new Error('Çıkış yapabilmek için önce bugün giriş kaydı oluşturmalısınız.')
    }
  }

  const locationNote = `Konum doğrulandı (~${locationCheck.distanceMeters} m).`
  const result = await createAttendanceLog({
    username,
    action: resolvedAction,
    source,
    note:
      note
        ? `${note} ${locationNote}`
        : `${resolvedAction === 'checkin' ? 'Giriş' : 'Çıkış'} QR kodu ile kayıt alındı. ${locationNote}`,
  })

  return {
    ...result,
    distanceMeters: locationCheck.distanceMeters,
  }
}

const getUserAttendanceHistory = async ({ username, month, year, limit }) => {
  if (!username) {
    throw new Error('Kullanıcı adı zorunludur.')
  }

  return getAttendanceByUsername(username, { month, year, limit })
}

export { handleAttendanceAction, getUserAttendanceHistory, resolveQrAction }
