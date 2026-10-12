import { createOvertime, getUserOvertimeRequests } from '../service/overtimeService.js'

const createOvertimeHandler = async (req, res) => {
  try {
    const { username, overtimeDate, overtimeHours, reason } = req.body
    const result = await createOvertime({
      username,
      overtimeDate,
      overtimeHours,
      reason,
    })

    return res.status(201).json({
      success: true,
      message: 'Fazla mesai bildirimi oluşturuldu.',
      data: result,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

const getOvertimeHistoryHandler = async (req, res) => {
  try {
    const { username } = req.params
    const requests = await getUserOvertimeRequests({ username })

    return res.status(200).json({
      success: true,
      data: requests,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

export { createOvertimeHandler, getOvertimeHistoryHandler }
