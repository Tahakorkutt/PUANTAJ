import { createLeave, getUserLeaveRequests } from '../service/leaveService.js'

const createLeaveHandler = async (req, res) => {
  try {
    const { username, leaveType, startDate, endDate, description } = req.body
    const result = await createLeave({
      username,
      leaveType,
      startDate,
      endDate,
      description,
    })

    return res.status(201).json({
      success: true,
      message: 'İzin talebi oluşturuldu.',
      data: result,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

const getLeaveHistoryHandler = async (req, res) => {
  try {
    const { username } = req.params
    const { requests, balance } = await getUserLeaveRequests({ username })

    return res.status(200).json({
      success: true,
      data: requests,
      balance,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

export { createLeaveHandler, getLeaveHistoryHandler }
