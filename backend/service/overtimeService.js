import { createOvertimeRequest, getOvertimeRequestsByUsername } from '../models/Overtime.js'

const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))

const createOvertime = async ({ username, overtimeDate, overtimeHours, reason }) => {
  if (!username) {
    throw new Error('Kullanıcı adı zorunludur.')
  }

  if (!isValidDate(overtimeDate)) {
    throw new Error('Geçerli bir fazla mesai tarihi seçmelisiniz.')
  }

  const hours = Number(overtimeHours)
  if (!overtimeHours || Number.isNaN(hours) || hours <= 0) {
    throw new Error('Geçerli bir fazla mesai süresi girmelisiniz.')
  }

  const trimmedReason = String(reason || '').trim()
  if (!trimmedReason) {
    throw new Error('Fazla mesai nedeni zorunludur.')
  }

  return createOvertimeRequest({
    username,
    overtimeDate,
    overtimeHours: hours,
    reason: trimmedReason,
  })
}

const getUserOvertimeRequests = async ({ username }) => {
  if (!username) {
    throw new Error('Kullanıcı adı zorunludur.')
  }

  return getOvertimeRequestsByUsername(username)
}

export { createOvertime, getUserOvertimeRequests }
