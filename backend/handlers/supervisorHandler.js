import {
  getSupervisorDashboard,
  approveSupervisorShift,
  rejectSupervisorShift,
  approveSupervisorLeave,
  rejectSupervisorLeave,
  approveSupervisorOvertime,
  rejectSupervisorOvertime,
} from '../service/supervisorService.js'

const getSupervisorDashboardHandler = async (req, res) => {
  try {
    const { username } = req.params
    const data = await getSupervisorDashboard({ username })

    return res.status(200).json({
      success: true,
      data,
    })
  } catch (error) {
    const statusCode = error.message.includes('yetki') ? 403 : 400
    return res.status(statusCode).json({
      success: false,
      message: error.message,
    })
  }
}

const createActionHandler = (actionFn, successMessage) => async (req, res) => {
  try {
    const { id } = req.params
    const { username } = req.body
    const result = await actionFn({ username, id: Number(id) })

    return res.status(200).json({
      success: true,
      message: successMessage,
      data: result,
    })
  } catch (error) {
    const statusCode = error.message.includes('yetki') || error.message.includes('ait değil')
      ? 403
      : 400

    return res.status(statusCode).json({
      success: false,
      message: error.message,
    })
  }
}

const approveShiftHandler = createActionHandler(
  approveSupervisorShift,
  'Vardiya değişim talebi onaylandı.',
)
const rejectShiftHandler = createActionHandler(
  rejectSupervisorShift,
  'Vardiya değişim talebi reddedildi.',
)
const approveLeaveHandler = createActionHandler(
  approveSupervisorLeave,
  'İzin talebi onaylandı.',
)
const rejectLeaveHandler = createActionHandler(
  rejectSupervisorLeave,
  'İzin talebi reddedildi.',
)
const approveOvertimeHandler = createActionHandler(
  approveSupervisorOvertime,
  'Fazla mesai bildirimi onaylandı.',
)
const rejectOvertimeHandler = createActionHandler(
  rejectSupervisorOvertime,
  'Fazla mesai bildirimi reddedildi.',
)

export {
  getSupervisorDashboardHandler,
  approveShiftHandler,
  rejectShiftHandler,
  approveLeaveHandler,
  rejectLeaveHandler,
  approveOvertimeHandler,
  rejectOvertimeHandler,
}
