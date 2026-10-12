import { findByUsername } from '../models/User.js'
import { createLeaveRequest, getLeaveRequestsByUsername } from '../models/Leave.js'

const ALLOWED_LEAVE_TYPES = [
  'Babalık izni (5 gün)',
  'Doğum izni',
  'Evlilik İzni (3 gün)',
  'İdari izin',
  'Nöbet izni',
  'Rapor',
  'RESMİ TATİL',
  'Saatlik İzin',
  'Ücretli izin',
  'Ücretsiz izin',
  'Yıllık izin',
]

const ANNUAL_LEAVE_YEAR = 2026
const DEFAULT_ANNUAL_ENTITLEMENT_DAYS = 14

const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))

const parseDateValue = (value) => {
  if (!value) {
    return null
  }

  const normalized = String(value).includes('T')
    ? String(value)
    : `${String(value).replace(' ', 'T')}${String(value).includes('Z') || /[+-]\d{2}:?\d{2}$/.test(String(value)) ? '' : 'Z'}`

  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

const countInclusiveDays = (startDate, endDate) => {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${(endDate || startDate)}T00:00:00`)
  const diffDays = Math.floor((end - start) / 86400000) + 1
  return diffDays > 0 ? diffDays : 0
}

const hasCompletedOneYearSeniority = (hireDate, referenceDate = new Date()) => {
  if (!hireDate) {
    return false
  }

  const oneYearLater = new Date(hireDate)
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1)
  return referenceDate >= oneYearLater
}

const getAnnualLeaveBalance = async ({ username, year = ANNUAL_LEAVE_YEAR }) => {
  const user = await findByUsername(username)
  if (!user) {
    throw new Error('Kullanıcı bulunamadı.')
  }

  const hireDate = parseDateValue(user.created_at)
  const eligible = hasCompletedOneYearSeniority(hireDate)
  const requests = await getLeaveRequestsByUsername(username)

  const usedDays = (requests || [])
    .filter(
      (item) =>
        item.leave_type === 'Yıllık izin' &&
        item.status === 'Onaylandı' &&
        String(item.start_date || '').startsWith(String(year)),
    )
    .reduce((total, item) => total + countInclusiveDays(item.start_date, item.end_date), 0)

  const entitlementDays = eligible ? DEFAULT_ANNUAL_ENTITLEMENT_DAYS : 0
  const remainingDays = eligible ? Math.max(0, entitlementDays - usedDays) : 0

  return {
    year,
    eligible,
    entitlementDays,
    usedDays,
    remainingDays,
    hireDate: hireDate ? hireDate.toISOString() : null,
    message: eligible
      ? null
      : 'Henüz 1 yıllık kıdemi doldurmadığınız için bu yıl yıllık izin hak etmediniz.',
  }
}

const createLeave = async ({ username, leaveType, startDate, endDate, description = '' }) => {
  if (!username) {
    throw new Error('Kullanıcı adı zorunludur.')
  }

  if (!leaveType || !ALLOWED_LEAVE_TYPES.includes(leaveType)) {
    throw new Error('Geçersiz izin türü.')
  }

  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    throw new Error('Başlangıç ve bitiş tarihleri zorunludur.')
  }

  if (new Date(endDate) < new Date(startDate)) {
    throw new Error('Bitiş tarihi başlangıç tarihinden önce olamaz.')
  }

  if (leaveType === 'Yıllık izin') {
    const balance = await getAnnualLeaveBalance({ username, year: ANNUAL_LEAVE_YEAR })
    if (!balance.eligible) {
      throw new Error(
        'Henüz 1 yıllık kıdemi doldurmadığınız için bu yıl yıllık izin hak etmediniz.',
      )
    }

    const requestedDays = countInclusiveDays(startDate, endDate)
    if (requestedDays > balance.remainingDays) {
      throw new Error(
        `Kalan yıllık izin yetersiz. ${balance.year} yılı için kalan hak: ${balance.remainingDays} gün.`,
      )
    }
  }

  return createLeaveRequest({
    username,
    leaveType,
    startDate,
    endDate,
    description: String(description || '').trim(),
  })
}

const getUserLeaveRequests = async ({ username }) => {
  if (!username) {
    throw new Error('Kullanıcı adı zorunludur.')
  }

  const [requests, balance] = await Promise.all([
    getLeaveRequestsByUsername(username),
    getAnnualLeaveBalance({ username }),
  ])

  return { requests, balance }
}

export {
  createLeave,
  getUserLeaveRequests,
  getAnnualLeaveBalance,
  ALLOWED_LEAVE_TYPES,
  ANNUAL_LEAVE_YEAR,
}
