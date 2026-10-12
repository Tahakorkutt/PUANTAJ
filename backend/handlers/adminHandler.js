import {
  getAdminDashboard,
  createSupervisorAccount,
  listSupervisors,
  approveShiftRequest,
  rejectShiftRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  approveOvertimeRequest,
  rejectOvertimeRequest,
} from '../service/adminService.js'

const getAdminDashboardHandler = async (req, res) => {
  try {
    const data = await getAdminDashboard()

    return res.status(200).json({
      success: true,
      data,
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

const approveShiftHandler = async (req, res) => {
  try {
    const { id } = req.params
    const result = await approveShiftRequest({ id: Number(id) })

    return res.status(200).json({
      success: true,
      message: 'Vardiya değişim talebi onaylandı.',
      data: result,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

const rejectShiftHandler = async (req, res) => {
  try {
    const { id } = req.params
    const result = await rejectShiftRequest({ id: Number(id) })

    return res.status(200).json({
      success: true,
      message: 'Vardiya değişim talebi reddedildi.',
      data: result,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

const approveLeaveHandler = async (req, res) => {
  try {
    const { id } = req.params
    const result = await approveLeaveRequest({ id: Number(id) })

    return res.status(200).json({
      success: true,
      message: 'İzin talebi onaylandı.',
      data: result,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

const rejectLeaveHandler = async (req, res) => {
  try {
    const { id } = req.params
    const result = await rejectLeaveRequest({ id: Number(id) })

    return res.status(200).json({
      success: true,
      message: 'İzin talebi reddedildi.',
      data: result,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

const approveOvertimeHandler = async (req, res) => {
  try {
    const { id } = req.params
    const result = await approveOvertimeRequest({ id: Number(id) })

    return res.status(200).json({
      success: true,
      message: 'Fazla mesai bildirimi onaylandı.',
      data: result,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

const rejectOvertimeHandler = async (req, res) => {
  try {
    const { id } = req.params
    const result = await rejectOvertimeRequest({ id: Number(id) })

    return res.status(200).json({
      success: true,
      message: 'Fazla mesai bildirimi reddedildi.',
      data: result,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

const createSupervisorHandler = async (req, res) => {
  try {
    const { username, fullName, department, password } = req.body
    const result = await createSupervisorAccount({
      username,
      fullName,
      department,
      password,
    })

    return res.status(201).json({
      success: true,
      message: 'Birim sorumlusu kaydı oluşturuldu.',
      data: result,
    })
  } catch (error) {
    const statusCode = error.message.includes('zaten') ? 409 : 400
    return res.status(statusCode).json({
      success: false,
      message: error.message,
    })
  }
}

const listSupervisorsHandler = async (req, res) => {
  try {
    const supervisors = await listSupervisors()

    return res.status(200).json({
      success: true,
      data: supervisors,
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

export {
  getAdminDashboardHandler,
  createSupervisorHandler,
  listSupervisorsHandler,
  approveShiftHandler,
  rejectShiftHandler,
  approveLeaveHandler,
  rejectLeaveHandler,
  approveOvertimeHandler,
  rejectOvertimeHandler,
}
