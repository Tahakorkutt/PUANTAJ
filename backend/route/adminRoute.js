import express from 'express'
import {
  getAdminDashboardHandler,
  createSupervisorHandler,
  listSupervisorsHandler,
  approveShiftHandler,
  rejectShiftHandler,
  approveLeaveHandler,
  rejectLeaveHandler,
  approveOvertimeHandler,
  rejectOvertimeHandler,
} from '../handlers/adminHandler.js'

const router = express.Router()

router.get('/admin/dashboard', getAdminDashboardHandler)
router.get('/admin/supervisors', listSupervisorsHandler)
router.post('/admin/supervisors', createSupervisorHandler)
router.patch('/admin/shift/:id/approve', approveShiftHandler)
router.patch('/admin/shift/:id/reject', rejectShiftHandler)
router.patch('/admin/leave/:id/approve', approveLeaveHandler)
router.patch('/admin/leave/:id/reject', rejectLeaveHandler)
router.patch('/admin/overtime/:id/approve', approveOvertimeHandler)
router.patch('/admin/overtime/:id/reject', rejectOvertimeHandler)

export default router
