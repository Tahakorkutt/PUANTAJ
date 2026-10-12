import { getUserAttendanceHistory, handleAttendanceAction, resolveQrAction } from '../service/attendanceService.js'

const attendanceActionHandler = async (req, res) => {
  try {
    const { username, action, qrCode, source, note, latitude, longitude, accuracy } = req.body

    const resolvedAction = action || resolveQrAction(qrCode)
    const result = await handleAttendanceAction({
      username,
      action: resolvedAction,
      qrCode,
      source,
      note,
      latitude,
      longitude,
      accuracy,
    })

    return res.status(200).json({
      success: true,
      message: resolvedAction === 'checkin' ? 'Giriş kaydı oluşturuldu.' : 'Çıkış kaydı oluşturuldu.',
      data: result,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

const getAttendanceHistoryHandler = async (req, res) => {
  try {
    const { username } = req.params
    const { month, year, limit } = req.query
    const logs = await getUserAttendanceHistory({
      username,
      month: month ? Number(month) : undefined,
      year: year ? Number(year) : undefined,
      limit: limit ? Number(limit) : undefined,
    })

    return res.status(200).json({
      success: true,
      data: logs,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

export { attendanceActionHandler, getAttendanceHistoryHandler }
