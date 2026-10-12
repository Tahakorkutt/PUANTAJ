import bcrypt from 'bcryptjs'
import { findByUsername, createUser, countUsersByDepartment } from '../models/User.js'
import {
  getAttendanceLogsByDepartment,
  countTodayCheckinsByDepartment,
} from '../models/Attendance.js'
import {
  getLeaveRequestsByDepartment,
  getLeaveRequestById,
  countOnLeaveTodayByDepartment,
  updateLeaveRequestStatus,
} from '../models/Leave.js'
import {
  getShiftRequestsByDepartment,
  getShiftRequestById,
} from '../models/Shift.js'
import {
  getOvertimeRequestsByDepartment,
  getOvertimeRequestById,
  updateOvertimeRequestStatus,
} from '../models/Overtime.js'
import { buildAttendanceRows } from './adminService.js'
import { approveShiftByAdmin, rejectShiftByAdmin } from './shiftService.js'

const assertSupervisor = async (username) => {
  if (!username) {
    throw new Error('Kullanıcı adı zorunludur.')
  }

  const user = await findByUsername(username)
  if (!user) {
    throw new Error('Kullanıcı bulunamadı.')
  }

  if (user.role !== 'supervisor') {
    throw new Error('Bu işlem için birim sorumlusu yetkisi gereklidir.')
  }

  if (!user.department) {
    throw new Error('Birim sorumlusunun departman bilgisi tanımlı değil.')
  }

  return user
}

const assertSameDepartment = (requestDepartment, supervisorDepartment) => {
  if (!requestDepartment || requestDepartment !== supervisorDepartment) {
    throw new Error('Bu talep sizin departmanınıza ait değil.')
  }
}

const getSupervisorDashboard = async ({ username }) => {
  const supervisor = await assertSupervisor(username)
  const department = supervisor.department

  const [
    totalPersonnel,
    todayArrived,
    onLeaveToday,
    attendanceLogs,
    leaveRequests,
    shiftRequests,
    overtimeRequests,
  ] = await Promise.all([
    countUsersByDepartment(department),
    countTodayCheckinsByDepartment(department),
    countOnLeaveTodayByDepartment(department),
    getAttendanceLogsByDepartment(department),
    getLeaveRequestsByDepartment(department),
    getShiftRequestsByDepartment(department),
    getOvertimeRequestsByDepartment(department),
  ])

  return {
    department,
    supervisor: {
      username: supervisor.username,
      full_name: supervisor.full_name,
      department: supervisor.department,
    },
    stats: {
      totalPersonnel,
      todayArrived,
      onLeaveToday,
    },
    attendanceRows: buildAttendanceRows(attendanceLogs),
    leaveRequests,
    shiftRequests,
    overtimeRequests,
  }
}

const ensureSupervisorUser = async () => {
  const supervisorUsername = 'birimsorumlu'
  const existing = await findByUsername(supervisorUsername)

  if (existing) {
    return existing
  }

  const passwordHash = await bcrypt.hash('sorumlu123456', 10)

  return createUser({
    username: supervisorUsername,
    fullName: 'Birim Sorumlusu',
    department: 'bilgi teknolojileri',
    role: 'supervisor',
    passwordHash,
  })
}

const approveSupervisorShift = async ({ username, id }) => {
  const supervisor = await assertSupervisor(username)
  const request = await getShiftRequestById(id)

  if (!request) {
    throw new Error('Vardiya değişim talebi bulunamadı.')
  }

  assertSameDepartment(request.requester_department, supervisor.department)
  return approveShiftByAdmin({ id })
}

const rejectSupervisorShift = async ({ username, id }) => {
  const supervisor = await assertSupervisor(username)
  const request = await getShiftRequestById(id)

  if (!request) {
    throw new Error('Vardiya değişim talebi bulunamadı.')
  }

  assertSameDepartment(request.requester_department, supervisor.department)
  return rejectShiftByAdmin({ id })
}

const approveSupervisorLeave = async ({ username, id }) => {
  const supervisor = await assertSupervisor(username)
  const request = await getLeaveRequestById(id)

  if (!request) {
    throw new Error('İzin talebi bulunamadı.')
  }

  assertSameDepartment(request.department, supervisor.department)
  return updateLeaveRequestStatus(id, 'Onaylandı')
}

const rejectSupervisorLeave = async ({ username, id }) => {
  const supervisor = await assertSupervisor(username)
  const request = await getLeaveRequestById(id)

  if (!request) {
    throw new Error('İzin talebi bulunamadı.')
  }

  assertSameDepartment(request.department, supervisor.department)
  return updateLeaveRequestStatus(id, 'Reddedildi')
}

const approveSupervisorOvertime = async ({ username, id }) => {
  const supervisor = await assertSupervisor(username)
  const request = await getOvertimeRequestById(id)

  if (!request) {
    throw new Error('Fazla mesai bildirimi bulunamadı.')
  }

  assertSameDepartment(request.department, supervisor.department)
  return updateOvertimeRequestStatus(id, 'Onaylandı')
}

const rejectSupervisorOvertime = async ({ username, id }) => {
  const supervisor = await assertSupervisor(username)
  const request = await getOvertimeRequestById(id)

  if (!request) {
    throw new Error('Fazla mesai bildirimi bulunamadı.')
  }

  assertSameDepartment(request.department, supervisor.department)
  return updateOvertimeRequestStatus(id, 'Reddedildi')
}

export {
  getSupervisorDashboard,
  ensureSupervisorUser,
  approveSupervisorShift,
  rejectSupervisorShift,
  approveSupervisorLeave,
  rejectSupervisorLeave,
  approveSupervisorOvertime,
  rejectSupervisorOvertime,
}
