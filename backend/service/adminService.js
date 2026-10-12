import bcrypt from 'bcryptjs'
import {
  findByUsername,
  createUser,
  countAllUsers,
  findAllSupervisors,
  findSupervisorByDepartment,
} from '../models/User.js'
import { getAllAttendanceLogs, countTodayCheckins } from '../models/Attendance.js'
import { getAllLeaveRequests, countOnLeaveToday, updateLeaveRequestStatus } from '../models/Leave.js'
import { getAllShiftRequests } from '../models/Shift.js'
import { approveShiftByAdmin, rejectShiftByAdmin } from './shiftService.js'
import { getAllOvertimeRequests, updateOvertimeRequestStatus } from '../models/Overtime.js'

const ALLOWED_DEPARTMENTS = [
  'İnsan Kaynakları',
  'muhasebe',
  'üretim',
  'satış',
  'pazarlama',
  'bilgi teknolojileri',
  'lojistik',
  'yönetim',
]

const parseLogDate = (dateStr) => {
  if (!dateStr) {
    return new Date(NaN)
  }

  let normalized = String(dateStr).trim()
  if (!normalized.includes('T')) {
    normalized = normalized.replace(' ', 'T')
  }

  // SQLite CURRENT_TIMESTAMP UTC kaydeder ama Z eklemez; yoksa yerel saat sanılır.
  if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    normalized = `${normalized}Z`
  }

  return new Date(normalized)
}

const getDayKey = (dateStr) => {
  const date = parseLogDate(dateStr)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const truncateToMinute = (date) => {
  const truncated = new Date(date.getTime())
  truncated.setSeconds(0, 0)
  return truncated
}

const calculateDayWorkTotal = (dayLogs) => {
  const checkins = dayLogs
    .filter((log) => log.action === 'checkin')
    .sort((a, b) => parseLogDate(a.created_at) - parseLogDate(b.created_at))
  const checkouts = dayLogs
    .filter((log) => log.action === 'checkout')
    .sort((a, b) => parseLogDate(a.created_at) - parseLogDate(b.created_at))

  if (checkins.length === 0 || checkouts.length === 0) {
    return 0
  }

  const firstCheckin = truncateToMinute(parseLogDate(checkins[0].created_at))
  const lastCheckout = truncateToMinute(parseLogDate(checkouts[checkouts.length - 1].created_at))
  const diffMs = lastCheckout - firstCheckin

  return diffMs > 0 ? diffMs : 0
}

const formatDuration = (diffMs) => {
  if (!diffMs || diffMs <= 0) {
    return '0s 0d'
  }

  const hours = Math.floor(diffMs / 3600000)
  const minutes = Math.floor((diffMs % 3600000) / 60000)
  return `${hours}s ${minutes}d`
}

const formatTime = (dateStr) => {
  const date = parseLogDate(dateStr)

  if (Number.isNaN(date.getTime())) {
    return '--:--'
  }

  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

const formatDate = (dateStr) => {
  const date = parseLogDate(dateStr)

  if (Number.isNaN(date.getTime())) {
    return '--.--.----'
  }

  return date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const buildAttendanceRows = (logs) => {
  const dayMap = {}

  logs.forEach((log) => {
    const dayKey = `${log.username}:${getDayKey(log.created_at)}`

    if (!dayKey.endsWith(':')) {
      if (!dayMap[dayKey]) {
        dayMap[dayKey] = []
      }

      dayMap[dayKey].push(log)
    }
  })

  return Object.entries(dayMap)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([dayKey, dayLogs]) => {
      const sorted = [...dayLogs].sort((a, b) => parseLogDate(a.created_at) - parseLogDate(b.created_at))
      const checkins = sorted.filter((log) => log.action === 'checkin')
      const checkouts = sorted.filter((log) => log.action === 'checkout')
      const firstCheckin = checkins[0]
      const lastCheckout = checkouts[checkouts.length - 1]
      const workMs = calculateDayWorkTotal(dayLogs)

      let status = 'Eksik'
      if (firstCheckin && lastCheckout && workMs > 0) {
        status = 'Tamamlandı'
      } else if (firstCheckin && !lastCheckout) {
        status = 'Devam ediyor'
      }

      return {
        id: dayKey,
        username: dayLogs[0].username,
        personnel: dayLogs[0].full_name || dayLogs[0].username,
        department: dayLogs[0].department || '-',
        date: formatDate(firstCheckin?.created_at || lastCheckout?.created_at || dayLogs[0].created_at),
        checkin: firstCheckin ? formatTime(firstCheckin.created_at) : '--:--',
        checkout: lastCheckout ? formatTime(lastCheckout.created_at) : '--:--',
        duration: workMs > 0 ? formatDuration(workMs) : '--',
        status,
      }
    })
}

const getAdminDashboard = async () => {
  const [
    totalPersonnel,
    todayArrived,
    onLeaveToday,
    attendanceLogs,
    leaveRequests,
    shiftRequests,
    overtimeRequests,
    supervisors,
  ] = await Promise.all([
    countAllUsers(),
    countTodayCheckins(),
    countOnLeaveToday(),
    getAllAttendanceLogs(),
    getAllLeaveRequests(),
    getAllShiftRequests(),
    getAllOvertimeRequests(),
    findAllSupervisors(),
  ])

  return {
    stats: {
      totalPersonnel,
      todayArrived,
      onLeaveToday,
      supervisorCount: supervisors.length,
    },
    attendanceRows: buildAttendanceRows(attendanceLogs),
    leaveRequests,
    shiftRequests,
    overtimeRequests,
    supervisors,
    departments: ALLOWED_DEPARTMENTS,
  }
}

const createSupervisorAccount = async ({ username, fullName, department, password }) => {
  if (!username || !fullName || !department || !password) {
    throw new Error('Kullanıcı adı, ad soyad, departman ve şifre zorunludur.')
  }

  if (!ALLOWED_DEPARTMENTS.includes(department)) {
    throw new Error('Geçersiz departman seçimi.')
  }

  if (String(password).length < 8) {
    throw new Error('Şifre en az 8 karakter olmalıdır.')
  }

  const existingUser = await findByUsername(username)
  if (existingUser) {
    throw new Error('Bu kullanıcı adı zaten kullanılmaktadır.')
  }

  const existingSupervisor = await findSupervisorByDepartment(department)
  if (existingSupervisor) {
    throw new Error(`${department} biriminde zaten bir birim sorumlusu tanımlı (${existingSupervisor.username}).`)
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await createUser({
    username: String(username).trim(),
    fullName: String(fullName).trim(),
    department,
    role: 'supervisor',
    passwordHash,
  })

  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    department: user.department,
    role: user.role,
  }
}

const listSupervisors = async () => findAllSupervisors()

const ensureAdminUser = async () => {
  const adminUsername = 'admin'
  const existingAdmin = await findByUsername(adminUsername)

  if (existingAdmin) {
    return existingAdmin
  }

  const passwordHash = await bcrypt.hash('admin123456', 10)

  return createUser({
    username: adminUsername,
    fullName: 'Sistem Yöneticisi',
    department: 'Yönetim',
    role: 'admin',
    passwordHash,
  })
}

const approveShiftRequest = async ({ id }) => {
  if (!id) {
    throw new Error('Talep kimliği zorunludur.')
  }

  return approveShiftByAdmin({ id })
}

const rejectShiftRequest = async ({ id }) => {
  if (!id) {
    throw new Error('Talep kimliği zorunludur.')
  }

  return rejectShiftByAdmin({ id })
}

const approveLeaveRequest = async ({ id }) => {
  if (!id) {
    throw new Error('Talep kimliği zorunludur.')
  }

  return updateLeaveRequestStatus(id, 'Onaylandı')
}

const rejectLeaveRequest = async ({ id }) => {
  if (!id) {
    throw new Error('Talep kimliği zorunludur.')
  }

  return updateLeaveRequestStatus(id, 'Reddedildi')
}

const approveOvertimeRequest = async ({ id }) => {
  if (!id) {
    throw new Error('Talep kimliği zorunludur.')
  }

  return updateOvertimeRequestStatus(id, 'Onaylandı')
}

const rejectOvertimeRequest = async ({ id }) => {
  if (!id) {
    throw new Error('Talep kimliği zorunludur.')
  }

  return updateOvertimeRequestStatus(id, 'Reddedildi')
}

export {
  getAdminDashboard,
  ensureAdminUser,
  createSupervisorAccount,
  listSupervisors,
  approveShiftRequest,
  rejectShiftRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  approveOvertimeRequest,
  rejectOvertimeRequest,
  buildAttendanceRows,
  ALLOWED_DEPARTMENTS,
}
