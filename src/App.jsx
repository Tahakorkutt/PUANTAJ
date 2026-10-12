import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { BrowserQRCodeReader } from '@zxing/browser'
import QRCode from 'qrcode'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import AdminPanel from './AdminPanel.jsx'
import SupervisorPanel from './SupervisorPanel.jsx'
import './App.css'

const API_URL = 'http://localhost:5001/api'
const captureModes = {
  checkin: 'Giriş Oku',
  checkout: 'Çıkış Oku',
}

const qrCodes = {
  checkin: 'PUANTAJ-GIRIS-2026',
  checkout: 'PUANTAJ-CIKIS-2026',
}

const departments = [
  'İnsan Kaynakları',
  'muhasebe',
  'üretim',
  'satış',
  'pazarlama',
  'bilgi teknolojileri',
  'lojistik',
  'yönetim',
]

const normalizeDepartmentKey = (department) =>
  String(department || 'genel')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const OFFICE_LOCATION = {
  // Atatürk Organize Sanayi Bölgesi (AOSB / Çiğli) merkezi
  latitude: 38.4907953,
  longitude: 27.0383003,
  radiusMeters: 3000,
  address: 'Küçük Çiğli, Anadolu Cd. No:1163, 35620 Aosb/Çiğli/İzmir',
}

const toRadians = (degrees) => (degrees * Math.PI) / 180

const getDistanceInMeters = (fromLat, fromLon, toLat, toLon) => {
  const earthRadius = 6371000
  const dLat = toRadians(toLat - fromLat)
  const dLon = toRadians(toLon - fromLon)
  const lat1 = toRadians(fromLat)
  const lat2 = toRadians(toLat)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadius * c
}

const getCurrentPosition = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Tarayıcınız konum servisini desteklemiyor.'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error('Konum izni verilmedi. Puantaj için konum izni gereklidir.'))
          return
        }

        if (error.code === error.TIMEOUT) {
          reject(new Error('Konum alınamadı. Lütfen tekrar deneyin.'))
          return
        }

        reject(new Error('Konum bilgisi alınamadı. GPS açık olduğundan emin olun.'))
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      },
    )
  })

const assertClientWithinOffice = async () => {
  const position = await getCurrentPosition()
  const distance = getDistanceInMeters(
    position.latitude,
    position.longitude,
    OFFICE_LOCATION.latitude,
    OFFICE_LOCATION.longitude,
  )
  const adjustedDistance = Math.max(0, distance - (position.accuracy || 0))

  console.log('[Puantaj konum]', {
    izinVerilenYaricapMetre: OFFICE_LOCATION.radiusMeters,
    mesafeMetre: Math.round(distance),
    duzeltilmisMesafeMetre: Math.round(adjustedDistance),
    gpsHassasiyetMetre: Math.round(position.accuracy || 0),
    ofis: {
      latitude: OFFICE_LOCATION.latitude,
      longitude: OFFICE_LOCATION.longitude,
      address: OFFICE_LOCATION.address,
    },
    kullanici: {
      latitude: position.latitude,
      longitude: position.longitude,
    },
    alanIcinde: adjustedDistance <= OFFICE_LOCATION.radiusMeters,
  })

  if (adjustedDistance > OFFICE_LOCATION.radiusMeters) {
    throw new Error(
      `Puantaj için ofis alanında olmalısınız. (${OFFICE_LOCATION.address}) Yaklaşık ${Math.round(distance)} m uzaktasınız; izin verilen yarıçap ${OFFICE_LOCATION.radiusMeters} m. Konumunuz: ${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`,
    )
  }

  return {
    ...position,
    distanceMeters: Math.round(distance),
  }
}

const buildQrUrl = (code) => {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
  return `${baseUrl}?qr=${encodeURIComponent(code)}`
}

const normalizeQrValue = (value) => {
  const rawValue = String(value || '').trim()

  if (!rawValue) {
    return ''
  }

  try {
    const parsedUrl = new URL(rawValue)
    const urlValue = parsedUrl.searchParams.get('qr')
    if (urlValue) {
      return String(urlValue).trim().toUpperCase()
    }
  } catch {
    // not a URL, continue with direct string parsing below
  }

  const queryMatch = rawValue.match(/[?&]qr=([^&]+)/i)
  if (queryMatch && queryMatch[1]) {
    return String(queryMatch[1]).trim().toUpperCase()
  }

  return rawValue.toUpperCase()
}

const sidebarItems = [
  'Puantajım',
  'İzinlerim',
  'İzin Talebi',
  'Molalarım',
  'Vardiya Değişimi',
  'Fazla Mesai Bildir',
  'Eğitimlerim',
  'Mesajlar',
  'QR Giriş/Çıkış',
]

const parseLogDate = (dateStr) => {
  if (!dateStr) {
    return new Date(NaN)
  }

  let normalized = String(dateStr).trim()
  if (!normalized.includes('T')) {
    normalized = normalized.replace(' ', 'T')
  }

  // SQLite CURRENT_TIMESTAMP UTC kaydeder ama Z eklemez; yoksa tarayıcı yerel saat sanır.
  if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    normalized = `${normalized}Z`
  }

  return new Date(normalized)
}

const formatAttendanceTime = (dateStr) => {
  if (!dateStr) {
    return '--:--'
  }

  const date = parseLogDate(dateStr)

  if (Number.isNaN(date.getTime())) {
    return '--:--'
  }

  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

const formatAttendanceDateTime = (dateStr) => {
  if (!dateStr) {
    return '--.--.---- --:--'
  }

  const date = parseLogDate(dateStr)

  if (Number.isNaN(date.getTime())) {
    return '--.--.---- --:--'
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const time = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

  return `${day}.${month}.${year} ${time}`
}

const isToday = (dateStr) => {
  const date = parseLogDate(dateStr)

  if (Number.isNaN(date.getTime())) {
    return false
  }

  return date.toDateString() === new Date().toDateString()
}

const getActionLabel = (action) => (action === 'checkin' ? 'Giriş' : 'Çıkış')

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

  // Ekranda HH:MM gösterildiği için süre de dakika hassasiyetinde hesaplanır.
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

const getDayName = (dateStr) => {
  const date = parseLogDate(dateStr)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleDateString('tr-TR', { weekday: 'long' })
}

const formatDisplayDate = (dateStr) => {
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

const buildDailyAttendanceRows = (logs) => {
  const dayMap = {}

  logs.forEach((log) => {
    const dayKey = getDayKey(log.created_at)

    if (!dayKey) {
      return
    }

    if (!dayMap[dayKey]) {
      dayMap[dayKey] = []
    }

    dayMap[dayKey].push(log)
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
      const hasCheckin = Boolean(firstCheckin)
      const hasCheckout = Boolean(lastCheckout)

      let status = 'Eksik'
      if (hasCheckin && hasCheckout && workMs > 0) {
        status = 'Tamamlandı'
      } else if (hasCheckin && !hasCheckout) {
        status = 'Devam ediyor'
      }

      return {
        id: dayKey,
        date: formatDisplayDate(firstCheckin?.created_at || lastCheckout?.created_at || dayLogs[0].created_at),
        day: getDayName(firstCheckin?.created_at || lastCheckout?.created_at || dayLogs[0].created_at),
        checkin: firstCheckin ? formatAttendanceTime(firstCheckin.created_at) : '--:--',
        checkout: lastCheckout ? formatAttendanceTime(lastCheckout.created_at) : '--:--',
        work: workMs > 0 ? formatDuration(workMs) : '--',
        workMs,
        status,
      }
    })
}

const sumDailyDisplayedWork = (dailyRows) => {
  const totalMinutes = dailyRows.reduce((sum, row) => {
    if (!row.workMs || row.workMs <= 0) {
      return sum
    }

    const hours = Math.floor(row.workMs / 3600000)
    const minutes = Math.floor((row.workMs % 3600000) / 60000)
    return sum + hours * 60 + minutes
  }, 0)

  return formatDuration(totalMinutes * 60000)
}

const isSameMonth = (dateStr, referenceDate = new Date()) => {
  const date = parseLogDate(dateStr)

  if (Number.isNaN(date.getTime())) {
    return false
  }

  return date.getMonth() === referenceDate.getMonth() && date.getFullYear() === referenceDate.getFullYear()
}

const calculateMonthlyStats = (logs, leaveRequests = []) => {
  const now = new Date()
  const monthLogs = logs.filter((log) => isSameMonth(log.created_at, now))
  const dailyRows = buildDailyAttendanceRows(monthLogs)
  const totalWork = sumDailyDisplayedWork(dailyRows)

  const attendedDayKeys = new Set(
    dailyRows.map((row) => row.id),
  )
  const leaveDayKeys = new Set()

  leaveRequests
    .filter((item) => item.status === 'Onaylandı')
    .forEach((item) => {
      const start = new Date(`${item.start_date}T00:00:00`)
      const end = new Date(`${(item.end_date || item.start_date)}T00:00:00`)

      for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        if (cursor.getMonth() !== now.getMonth() || cursor.getFullYear() !== now.getFullYear()) {
          continue
        }

        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
        leaveDayKeys.add(key)
      }
    })

  // Devamsızlık: bu ay ilk puantajdan sonra, düne kadar hafta içi + kayıt yok + onaylı izin yok
  const absenceDates = []
  const year = now.getFullYear()
  const month = now.getMonth()
  const lastCountedDay = now.getDate() - 1

  const attendedDayNumbers = [...attendedDayKeys]
    .map((key) => Number(key.split('-')[2]))
    .filter((day) => !Number.isNaN(day))
    .sort((a, b) => a - b)

  const monthName = now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })

  // Bu ay hiç puantaj yoksa veya henüz dün yoksa 0
  if (attendedDayNumbers.length === 0 || lastCountedDay < 1) {
    return {
      totalWork,
      workDays: `${dailyRows.length} gün`,
      workDaysList: dailyRows,
      absenceDays: '0',
      absenceDates: [],
      monthName,
    }
  }

  const firstAttendanceDay = attendedDayNumbers[0]

  for (let day = firstAttendanceDay; day <= lastCountedDay; day += 1) {
    const date = new Date(year, month, day)
    const weekDay = date.getDay()

    if (weekDay === 0 || weekDay === 6) {
      continue
    }

    const dayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    if (attendedDayKeys.has(dayKey) || leaveDayKeys.has(dayKey)) {
      continue
    }

    absenceDates.push({
      key: dayKey,
      dateFormatted: `${String(day).padStart(2, '0')}.${String(month + 1).padStart(2, '0')}.${year}`,
      dayName: date.toLocaleDateString('tr-TR', { weekday: 'long' }),
    })
  }

  return {
    totalWork,
    workDays: `${dailyRows.length} gün`,
    workDaysList: dailyRows,
    absenceDays: String(absenceDates.length),
    absenceDates,
    monthName,
  }
}

const leaveTypes = [
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

const formatLeaveDateRange = (startDate, endDate) => {
  if (!startDate) {
    return '-'
  }

  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${(endDate || startDate)}T00:00:00`)

  const formatOne = (date) =>
    date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'long',
    })

  if (startDate === endDate || !endDate) {
    return formatOne(start)
  }

  return `${formatOne(start)} - ${formatOne(end)}`
}

const calculateLeaveDays = (startDate, endDate) => {
  if (!startDate) {
    return '0 gün'
  }

  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${(endDate || startDate)}T00:00:00`)
  const diffDays = Math.floor((end - start) / 86400000) + 1

  if (diffDays <= 0) {
    return '0 gün'
  }

  return `${diffDays} gün`
}

const activityItemsBase = [
  { title: 'Molalarım', value: '0', color: 'purple' },
  { title: 'Vardiya Değişim', value: '0 talep', color: 'cyan' },
  { title: 'Fazla Mesai', value: '0 saat', color: 'orange' },
]

function App() {
  const [view, setView] = useState('login')
  const [status, setStatus] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false)
  const [adminUser, setAdminUser] = useState(null)
  const [isSupervisorLoggedIn, setIsSupervisorLoggedIn] = useState(false)
  const [supervisorUser, setSupervisorUser] = useState(null)
  const [activeMenu, setActiveMenu] = useState('Eğitimlerim')
  const [formData, setFormData] = useState({
    username: 'aysekaya',
    password: '12345678',
    fullName: 'Ayşe Kaya',
    department: '',
  })
  const [loggedUser, setLoggedUser] = useState(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraMode, setCameraMode] = useState('checkin')
  const [cameraMessage, setCameraMessage] = useState('')
  const [scannedQrCode, setScannedQrCode] = useState('')
  const [qrImage, setQrImage] = useState({ checkin: '', checkout: '' })
  const [attendanceLogs, setAttendanceLogs] = useState([])
  const [attendanceMessage, setAttendanceMessage] = useState('')
  const [qrAlert, setQrAlert] = useState({
    open: false,
    message: '',
    severity: 'success',
  })
  const [showAttendanceDetail, setShowAttendanceDetail] = useState(false)
  const [leaveRequests, setLeaveRequests] = useState([])
  const [leaveBalance, setLeaveBalance] = useState(null)
  const [showAbsenceModal, setShowAbsenceModal] = useState(false)
  const [showWorkDaysModal, setShowWorkDaysModal] = useState(false)
  const [leaveMessage, setLeaveMessage] = useState('')
  const [leaveSubmitting, setLeaveSubmitting] = useState(false)
  const [leaveForm, setLeaveForm] = useState({
    leaveType: 'Yıllık izin',
    startDate: '',
    endDate: '',
    description: '',
  })
  const [shiftForm, setShiftForm] = useState({
    counterpartUsername: '',
    myShiftDate: '',
    swapDate: '',
    description: '',
  })
  const [shiftRequests, setShiftRequests] = useState([])
  const [departmentColleagues, setDepartmentColleagues] = useState([])
  const [shiftMessage, setShiftMessage] = useState('')
  const [shiftSubmitting, setShiftSubmitting] = useState(false)
  const [overtimeForm, setOvertimeForm] = useState({
    overtimeDate: '',
    overtimeHours: '',
    overtimeReason: '',
  })
  const [overtimeMessage, setOvertimeMessage] = useState('')
  const [overtimeSubmitting, setOvertimeSubmitting] = useState(false)
  const [overtimeRequests, setOvertimeRequests] = useState([])
  const [chatThreads, setChatThreads] = useState(() => {
    try {
      const saved = localStorage.getItem('puantajChatThreads')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })
  const [trainingMessageDraft, setTrainingMessageDraft] = useState('')
  const [memberForm, setMemberForm] = useState({
    fullName: '',
  })
  const [showMemberForm, setShowMemberForm] = useState(false)
  const [showNewMessageModal, setShowNewMessageModal] = useState(false)
  const [selectedChatUser, setSelectedChatUser] = useState(null)
  const [memberSubmitting, setMemberSubmitting] = useState(false)
  const [memberMessage, setMemberMessage] = useState('')
  const [breakRecords] = useState([])
  const videoRef = useRef(null)
  const cameraStreamRef = useRef(null)
  const scannerCleanupRef = useRef(null)
  const scanInProgressRef = useRef(false)
  const handleQrScanRef = useRef(null)
  const socketRef = useRef(null)

  const fetchLeaveRequests = async (username) => {
    if (!username) {
      return
    }

    try {
      const response = await fetch(`${API_URL}/leave/${encodeURIComponent(username)}`)
      const result = await response.json()

      if (response.ok && result.success) {
        setLeaveRequests(result.data || [])
        setLeaveBalance(result.balance || null)
      }
    } catch (error) {
      console.error('Leave fetch error:', error)
    }
  }

  const fetchDepartmentColleagues = async (username) => {
    if (!username) {
      return
    }

    try {
      const response = await fetch(
        `${API_URL}/users/colleagues/${encodeURIComponent(username)}`,
      )
      const result = await response.json()

      if (response.ok && result.success) {
        setDepartmentColleagues(result.data || [])
      }
    } catch (error) {
      console.error('Colleagues fetch error:', error)
    }
  }

  const buildConversationKey = (userA, userB) => {
    const left = String(userA || '').trim()
    const right = String(userB || '').trim()

    if (!left || !right) {
      return null
    }

    return [left, right].sort((a, b) => a.localeCompare(b, 'tr-TR')).join(':')
  }

  const fetchConversationMessages = async (userA, userB) => {
    if (!userA || !userB) {
      return
    }

    const key = buildConversationKey(userA, userB)
    if (!key) {
      return
    }

    try {
      const response = await fetch(
        `${API_URL}/chat/conversation/${encodeURIComponent(userA)}/${encodeURIComponent(userB)}`,
      )
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Mesajlar alınamadı.')
      }

      const messages = (result.data || []).map((message) => ({
        id: message.id,
        sender: message.sender,
        receiver: message.receiver,
        text: message.text,
        time: message.time || '--:--',
      }))

      setChatThreads((current) => ({
        ...current,
        [key]: messages,
      }))
    } catch (error) {
      console.error('Conversation fetch error:', error)
      setChatThreads((current) => ({
        ...current,
        [key]: current[key] || [],
      }))
    }
  }

  const fetchShiftRequests = async (username) => {
    if (!username) {
      return
    }

    try {
      const response = await fetch(`${API_URL}/shift/${encodeURIComponent(username)}`)
      const result = await response.json()

      if (response.ok && result.success) {
        setShiftRequests(result.data || [])
      }
    } catch (error) {
      console.error('Shift fetch error:', error)
    }
  }

  const fetchOvertimeRequests = async (username) => {
    if (!username) {
      return
    }

    try {
      const response = await fetch(`${API_URL}/overtime/${encodeURIComponent(username)}`)
      const result = await response.json()

      if (response.ok && result.success) {
        setOvertimeRequests(result.data || [])
      }
    } catch (error) {
      console.error('Overtime fetch error:', error)
    }
  }

  const fetchAttendanceHistory = async (username) => {
    if (!username) {
      return
    }

    try {
      const now = new Date()
      const month = now.getMonth() + 1
      const year = now.getFullYear()
      const response = await fetch(
        `${API_URL}/attendance/${encodeURIComponent(username)}?month=${month}&year=${year}&limit=500`,
      )
      const result = await response.json()

      if (response.ok && result.success) {
        setAttendanceLogs(result.data || [])
      }
    } catch (error) {
      console.error('Attendance fetch error:', error)
    }
  }

  const todayLogs = attendanceLogs.filter((log) => isToday(log.created_at))
  const todayCheckins = todayLogs.filter((log) => log.action === 'checkin')
  const todayCheckouts = todayLogs.filter((log) => log.action === 'checkout')
  const firstCheckinToday = todayCheckins.at(-1)
  const lastCheckoutToday = todayCheckouts[0]
  const todayWorkTotal = calculateDayWorkTotal(todayLogs)
  const todayRecords = [...todayLogs].reverse().map((log) => ({
    id: log.id,
    time: formatAttendanceDateTime(log.created_at),
    title: getActionLabel(log.action),
    note: log.note || 'QR kodu ile kayıt',
    status: 'Tamamlandı',
  }))
  const recentScans = attendanceLogs.slice(0, 2)
  const monthlyStats = calculateMonthlyStats(attendanceLogs, leaveRequests)
  const attendanceDetailRows = buildDailyAttendanceRows(attendanceLogs)
  const statsCards = [
    { label: 'Bu Ay Çalışma', value: monthlyStats.totalWork, tone: 'blue' },
    {
      label: 'Bu Ay Gün',
      value: monthlyStats.workDays,
      tone: 'green',
      clickable: true,
      onClick: () => setShowWorkDaysModal(true),
    },
    {
      label: `Kalan Yıllık İzin (${leaveBalance?.year || 2026})`,
      value: leaveBalance?.eligible
        ? `${leaveBalance.remainingDays} gün`
        : '0 gün',
      tone: 'amber',
    },
    {
      label: 'Bu Ay Devamsızlık',
      value: `${monthlyStats.absenceDays} gün`,
      tone: 'red',
      clickable: true,
      onClick: () => setShowAbsenceModal(true),
    },
  ]
  const leaveRows = leaveRequests.map((item) => ({
    id: item.id,
    type: item.leave_type,
    days: calculateLeaveDays(item.start_date, item.end_date),
    status: item.status,
  }))
  const pendingLeaveCount = leaveRequests.filter((item) => item.status === 'İnceleniyor').length
  const monthlyOvertimeHours = overtimeRequests
    .filter((item) => {
      const requestDate = new Date(`${item.overtime_date}T00:00:00`)
      const now = new Date()
      return (
        requestDate.getFullYear() === now.getFullYear() &&
        requestDate.getMonth() === now.getMonth()
      )
    })
    .reduce((total, item) => total + Number(item.overtime_hours || 0), 0)
  const activityItems = [
    ...activityItemsBase.map((item) => {
      if (item.title === 'Molalarım') {
        return { ...item, value: String(breakRecords.length) }
      }

      if (item.title === 'Vardiya Değişim') {
        return { ...item, value: `${shiftRequests.length} talep` }
      }

      if (item.title === 'Fazla Mesai') {
        return { ...item, value: `${monthlyOvertimeHours} saat` }
      }

      return item
    }),
    { title: 'İzin Talebi', value: `${pendingLeaveCount} açık`, color: 'red' },
  ]
  const departmentGroupName = loggedUser?.department || 'Genel Grup'
  const departmentKey = `puantajChat:${normalizeDepartmentKey(loggedUser?.department)}`
  const departmentMembers = (departmentColleagues || []).filter(
    (person) =>
      person?.full_name &&
      person.full_name !== (loggedUser?.fullName || loggedUser?.full_name || loggedUser?.username),
  )
  const selectedChatLabel = selectedChatUser
    ? selectedChatUser.full_name || selectedChatUser.username
    : departmentGroupName
  const chatThreadKey = selectedChatUser && loggedUser?.username
    ? [String(loggedUser.username), String(selectedChatUser.username || selectedChatUser.full_name)]
        .sort()
        .join(':')
    : null
  const activeChatMessages = chatThreadKey ? chatThreads[chatThreadKey] || [] : []
  const currentUserDisplayName = loggedUser?.fullName || loggedUser?.full_name || loggedUser?.username || 'Sen'

  const stopCamera = () => {
    if (scannerCleanupRef.current) {
      scannerCleanupRef.current()
      scannerCleanupRef.current = null
    }

    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop())
      cameraStreamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  const closeCameraDialog = () => {
    stopCamera()
    setCameraOpen(false)
    setCameraMessage('')
    setScannedQrCode('')
  }

  const handleSendTrainingMessage = async () => {
    const trimmed = trainingMessageDraft.trim()

    if (!trimmed || !selectedChatUser || !loggedUser?.username) {
      return
    }

    const receiver = String(selectedChatUser.username || selectedChatUser.full_name || '').trim()
    if (!receiver) {
      return
    }

    const key = buildConversationKey(loggedUser.username, receiver)
    if (!key) {
      return
    }

    try {
      const response = await fetch(`${API_URL}/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: loggedUser.username,
          receiver,
          text: trimmed,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Mesaj gönderilemedi.')
      }

      const savedMessage = {
        id: result.data?.id || Date.now(),
        sender: result.data?.sender || loggedUser.username,
        receiver: result.data?.receiver || receiver,
        text: result.data?.text || trimmed,
        time: result.data?.time || new Date().toLocaleTimeString('tr-TR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }

      setChatThreads((current) => ({
        ...current,
        [key]: [...(current[key] || []), savedMessage],
      }))

      setTrainingMessageDraft('')
      await fetchConversationMessages(loggedUser.username, receiver)
    } catch (error) {
      console.error('Send conversation message error:', error)
      setChatThreads((current) => ({
        ...current,
        [key]: [
          ...(current[key] || []),
          {
            id: Date.now(),
            sender: currentUserDisplayName,
            receiver,
            text: trimmed,
            time: new Date().toLocaleTimeString('tr-TR', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          },
        ],
      }))
      setTrainingMessageDraft('')
    }
  }

  const handleMemberFormChange = (event) => {
    const { name, value } = event.target
    setMemberForm((previous) => ({ ...previous, [name]: value }))
  }

  const handleMemberSubmit = async (event) => {
    event.preventDefault()
    const trimmedFullName = memberForm.fullName.trim()

    if (!trimmedFullName) {
      setMemberMessage('Ad soyad alanı boş olamaz.')
      return
    }

    setMemberMessage('')
    setMemberSubmitting(true)

    try {
      const normalizedName = trimmedFullName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '')
      const username = `${normalizedName || 'uye'}.${Date.now().toString().slice(-4)}`
      const generatedPassword = '12345678'
      const department = loggedUser?.department || 'Genel'

      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: trimmedFullName,
          username,
          department,
          password: generatedPassword,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Üye oluşturulamadı.')
      }

      setMemberMessage(`Üye kaydı oluşturuldu: ${result.data.username}`)
      setMemberForm({ fullName: '' })
      setShowMemberForm(false)

      if (loggedUser?.username) {
        fetchDepartmentColleagues(loggedUser.username)
      }
    } catch (error) {
      setMemberMessage(error instanceof Error ? error.message : 'Üye oluşturulamadı.')
    } finally {
      setMemberSubmitting(false)
    }
  }

  useEffect(() => {
    const savedAdmin = localStorage.getItem('puantajAdmin')

    if (savedAdmin) {
      try {
        const saved = JSON.parse(savedAdmin)
        if (saved.role === 'admin') {
          setAdminUser({
            ...saved,
            fullName: saved.fullName || saved.full_name || '',
          })
          setIsAdminLoggedIn(true)
          return
        }
      } catch {
        localStorage.removeItem('puantajAdmin')
      }
    }

    const savedSupervisor = localStorage.getItem('puantajSupervisor')

    if (savedSupervisor) {
      try {
        const saved = JSON.parse(savedSupervisor)
        if (saved.role === 'supervisor') {
          setSupervisorUser({
            ...saved,
            fullName: saved.fullName || saved.full_name || '',
            department: saved.department || '',
          })
          setIsSupervisorLoggedIn(true)
          return
        }
      } catch {
        localStorage.removeItem('puantajSupervisor')
      }
    }

    const savedUser = localStorage.getItem('puantajUser')

    if (!savedUser) {
      return
    }

    try {
      const saved = JSON.parse(savedUser)
      const user = {
        ...saved,
        fullName: saved.fullName || saved.full_name || '',
        department: saved.department || '',
        role: saved.role || 'user',
      }

      if (user.role === 'supervisor') {
        setSupervisorUser(user)
        setIsSupervisorLoggedIn(true)
        localStorage.setItem('puantajSupervisor', JSON.stringify(user))
        localStorage.removeItem('puantajUser')
        return
      }

      setLoggedUser(user)
      setIsLoggedIn(true)
    } catch {
      localStorage.removeItem('puantajUser')
    }
  }, [])

  useEffect(() => {
    if (!loggedUser?.username) {
      return
    }

    const socket = io('http://localhost:5001', {
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join-chat', { username: loggedUser.username })
    })

    socket.on('chat-message', async (message) => {
      if (!message || !message.text) {
        return
      }

      const sender = String(message.sender || '').trim()
      const receiver = String(message.receiver || '').trim()
      const activeUser = String(loggedUser.username || '').trim()
      const counterpart = [sender, receiver].find((user) => user && user !== activeUser)

      if (!counterpart) {
        return
      }

      const key = buildConversationKey(activeUser, counterpart)
      if (!key) {
        return
      }

      await fetchConversationMessages(activeUser, counterpart)

      setChatThreads((current) => {
        const existing = current[key] || []
        const alreadyExists = existing.some(
          (item) => item.id === message.id || (item.text === message.text && item.sender === message.sender && item.time === message.time),
        )

        if (alreadyExists) {
          return current
        }

        return {
          ...current,
          [key]: [
            ...existing,
            {
              id: message.id || Date.now(),
              sender: message.sender,
              receiver: message.receiver,
              text: message.text,
              time: message.time || new Date().toLocaleTimeString('tr-TR', {
                hour: '2-digit',
                minute: '2-digit',
              }),
            },
          ],
        }
      })
    })

    return () => {
      socket.emit('leave-chat', { username: loggedUser.username })
      socket.off('chat-message')
      socket.off('connect')
      socket.disconnect()
      socketRef.current = null
    }
  }, [loggedUser?.username])

  useEffect(() => {
    if (!selectedChatUser || !loggedUser?.username) {
      return
    }

    const selectedUsername = String(selectedChatUser.username || selectedChatUser.full_name || '').trim()
    if (!selectedUsername) {
      return
    }

    const key = buildConversationKey(loggedUser.username, selectedUsername)
    if (!key) {
      return
    }

    const loadConversation = async () => {
      try {
        await fetchConversationMessages(loggedUser.username, selectedUsername)
        setChatThreads((current) => {
          if (current[key] && current[key].length > 0) {
            return current
          }

          return {
            ...current,
            [key]: [
              {
                id: `intro-${key}`,
                sender: selectedChatUser.full_name || selectedChatUser.username,
                text: `Merhaba ${selectedChatUser.full_name || selectedChatUser.username}! Mesajlaşmaya başlayabilirsiniz.`,
                time: '09:15',
              },
            ],
          }
        })
      } catch {
        setChatThreads((current) => ({
          ...current,
          [key]: [
            {
              id: `intro-${key}`,
              sender: selectedChatUser.full_name || selectedChatUser.username,
              text: `Merhaba ${selectedChatUser.full_name || selectedChatUser.username}! Mesajlaşmaya başlayabilirsiniz.`,
              time: '09:15',
            },
          ],
        }))
      }
    }

    loadConversation()
  }, [selectedChatUser, loggedUser?.username])

  useEffect(() => {
    try {
      localStorage.setItem('puantajChatThreads', JSON.stringify(chatThreads))
    } catch {
      // ignore localStorage write failures for chat state
    }
  }, [chatThreads])

  useEffect(() => {
    const onStorageUpdate = (event) => {
      if (event.key !== 'puantajChatThreads' || !event.newValue) {
        return
      }

      try {
        const parsed = JSON.parse(event.newValue)
        setChatThreads(parsed && typeof parsed === 'object' ? parsed : {})
      } catch {
        setChatThreads({})
      }
    }

    window.addEventListener('storage', onStorageUpdate)
    return () => window.removeEventListener('storage', onStorageUpdate)
  }, [])

  useEffect(() => {
    if (loggedUser?.username) {
      fetchAttendanceHistory(loggedUser.username)
      fetchLeaveRequests(loggedUser.username)
      fetchShiftRequests(loggedUser.username)
      fetchOvertimeRequests(loggedUser.username)
    }
  }, [loggedUser?.username])

  useEffect(() => {
    if (loggedUser?.username && (activeMenu === 'Vardiya Değişimi' || activeMenu === 'Mesajlar')) {
      fetchDepartmentColleagues(loggedUser.username)
    }
  }, [loggedUser?.username, activeMenu])

  useEffect(() => {
    if (departmentMembers.length > 0 && !selectedChatUser) {
      setSelectedChatUser(departmentMembers[0])
      return
    }

    if (selectedChatUser && !departmentMembers.some((person) => person.username === selectedChatUser.username)) {
      setSelectedChatUser(departmentMembers[0] || null)
    }
  }, [departmentMembers, selectedChatUser])

  useEffect(() => {
    const createQrCode = async () => {
      try {
        const [checkinCode, checkoutCode] = await Promise.all([
          QRCode.toDataURL(buildQrUrl(qrCodes.checkin), {
            width: 220,
            margin: 1,
            color: { dark: '#0f172a', light: '#ffffff' },
          }),
          QRCode.toDataURL(buildQrUrl(qrCodes.checkout), {
            width: 220,
            margin: 1,
            color: { dark: '#0f172a', light: '#ffffff' },
          }),
        ])

        setQrImage({ checkin: checkinCode, checkout: checkoutCode })
      } catch (error) {
        console.error('QR code generation failed:', error)
      }
    }

    createQrCode()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const qrParam = params.get('qr')

    if (!qrParam || !loggedUser?.username) {
      return
    }

    const normalized = normalizeQrValue(qrParam)

    if (normalized === qrCodes.checkin || normalized === qrCodes.checkout) {
      handleQrScan(normalized)
      const nextUrl = new URL(window.location.href)
      nextUrl.searchParams.delete('qr')
      window.history.replaceState({}, '', nextUrl)
    }
  }, [loggedUser])

  useEffect(() => {
    if (!cameraOpen) {
      return undefined
    }

    let isCancelled = false
    let reader = null
    let controls = null

    const isIgnorableScanError = (error) => {
      if (!error) {
        return true
      }

      const name = error.name || error.constructor?.name || ''
      const message = String(error.message || error)

      return (
        name.includes('NotFoundException') ||
        message.includes('NotFoundException') ||
        message.includes('No MultiFormat Readers') ||
        message.includes('ChecksumException') ||
        message.includes('FormatException')
      )
    }

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraMessage('Tarayıcı kamera erişimini desteklemiyor.')
          return
        }

        setCameraMessage('Kamera açılıyor...')

        if (!videoRef.current) {
          return
        }

        reader = new BrowserQRCodeReader(undefined, {
          delayBetweenScanAttempts: 300,
          delayBetweenScanSuccess: 1500,
        })

        controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result, error) => {
            if (isCancelled || scanInProgressRef.current) {
              return
            }

            if (result) {
              const decodedValue = result.getText()
              setScannedQrCode(decodedValue)
              setCameraMessage('QR kod bulundu. İşlem kaydediliyor...')

              if (controls) {
                try {
                  controls.stop()
                } catch {
                  // ignore stop errors
                }
              }

              if (handleQrScanRef.current) {
                handleQrScanRef.current(decodedValue)
              }
              return
            }

            // QR henüz bulunamadıysa bu beklenen bir durum; konsola yazma
            if (error && !isIgnorableScanError(error)) {
              console.error('QR decode error:', error)
            }
          },
        )

        if (isCancelled) {
          controls?.stop()
          return
        }

        cameraStreamRef.current = videoRef.current.srcObject
        setCameraMessage('Kamerayı QR koda tutun...')

        scannerCleanupRef.current = () => {
          isCancelled = true
          try {
            controls?.stop()
          } catch {
            // ignore
          }
          try {
            reader?.reset()
          } catch {
            // ignore
          }
        }
      } catch (error) {
        setCameraMessage('Kamera izni verilmedi. Lütfen erişime izin verin.')
      }
    }

    startCamera()

    return () => {
      isCancelled = true
      stopCamera()
    }
  }, [cameraOpen, cameraMode])

  const handleInputChange = (event) => {
    const { name, value } = event.target
    setFormData((previous) => ({ ...previous, [name]: value }))
  }

  const handleAdminLogout = async () => {
    try {
      if (adminUser?.username) {
        await fetch(`${API_URL}/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username: adminUser.username }),
        })
      }
    } catch (error) {
      console.error('Admin logout error:', error)
    } finally {
      localStorage.removeItem('puantajAdmin')
      setAdminUser(null)
      setIsAdminLoggedIn(false)
      setStatus('Admin oturumu kapatıldı.')
      setView('login')
    }
  }

  const handleSupervisorLogout = async () => {
    try {
      if (supervisorUser?.username) {
        await fetch(`${API_URL}/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username: supervisorUser.username }),
        })
      }
    } catch (error) {
      console.error('Supervisor logout error:', error)
    } finally {
      localStorage.removeItem('puantajSupervisor')
      setSupervisorUser(null)
      setIsSupervisorLoggedIn(false)
      setStatus('Birim sorumlusu oturumu kapatıldı.')
      setView('login')
    }
  }

  const handleLogout = async () => {
    try {
      if (loggedUser?.username) {
        const response = await fetch(`${API_URL}/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username: loggedUser.username }),
        })

        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Çıkış başarısız.')
        }
      }
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      localStorage.removeItem('puantajUser')
      setLoggedUser(null)
      setIsLoggedIn(false)
      setStatus('Çıkış yapıldı.')
      setView('login')
    }
  }

  const handleQuickAttendanceAction = async (mode) => {
    if (!loggedUser?.username) {
      setCameraMessage('Önce giriş yapmalısınız.')
      return
    }

    setCameraMode(mode)
    setCameraMessage(`${captureModes[mode]} için konum kontrol ediliyor...`)
    setCameraOpen(true)

    try {
      const location = await assertClientWithinOffice()

      const response = await fetch(`${API_URL}/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: loggedUser.username,
          action: mode,
          source: 'camera',
          note: `${captureModes[mode]} işlemi QR kodu ile alındı.`,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Kayıt işlemi başarısız.')
      }

      setCameraMessage(`${captureModes[mode]} kaydı başarıyla tamamlandı.`)
    } catch (error) {
      setCameraMessage(error.message)
    }
  }

  const handleQrScan = async (value) => {
    if (scanInProgressRef.current) {
      return
    }

    const normalized = normalizeQrValue(value)
    setScannedQrCode(normalized)

    if (!normalized) {
      setCameraMessage('QR değeri boş olamaz.')
      return
    }

    if (!loggedUser?.username) {
      setCameraMessage('Önce giriş yapmalısınız.')
      return
    }

    scanInProgressRef.current = true
    console.log('[Puantaj QR]', {
      qrCode: normalized,
      izinVerilenYaricapMetre: OFFICE_LOCATION.radiusMeters,
    })
    setCameraMessage('Konum kontrol ediliyor...')

    try {
      const location = await assertClientWithinOffice()

      setCameraMessage(`Konum uygun (~${location.distanceMeters} m). Kayıt yapılıyor...`)

      const response = await fetch(`${API_URL}/attendance/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: loggedUser.username,
          qrCode: normalized,
          source: 'camera',
          note: 'QR kodu ile puantaj kaydı alındı.',
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
        }),
      })

      const text = await response.text()
      const result = text ? JSON.parse(text) : {}

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'QR kaydı başarısız.')
      }

      const resolvedAction = normalized === qrCodes.checkin ? 'checkin' : 'checkout'
      await fetchAttendanceHistory(loggedUser.username)
      setCameraMessage(`${captureModes[resolvedAction]} kaydı başarıyla tamamlandı.`)
      setAttendanceMessage(
        `${getActionLabel(resolvedAction)} kaydı puantaja eklendi (${formatAttendanceTime(result.data?.created_at)}).`,
      )
      setQrAlert({
        open: true,
        message:
          resolvedAction === 'checkin'
            ? 'Giriş başarıyla yapıldı.'
            : 'Çıkış başarıyla yapıldı.',
        severity: 'success',
      })
      closeCameraDialog()
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Sunucuya ulaşılamıyor. Backend çalışıyor mu?'

      setCameraMessage(message)
      setQrAlert({
        open: true,
        message,
        severity: 'error',
      })
    } finally {
      scanInProgressRef.current = false
    }
  }

  handleQrScanRef.current = handleQrScan

  const handleLeaveFormChange = (event) => {
    const { name, value } = event.target
    setLeaveForm((previous) => ({ ...previous, [name]: value }))
  }

  const handleShiftFormChange = (event) => {
    const { name, value } = event.target
    setShiftForm((previous) => ({ ...previous, [name]: value }))
  }

  const handleShiftSubmit = async (event) => {
    event.preventDefault()
    setShiftMessage('')

    if (!loggedUser?.username) {
      setShiftMessage('Önce giriş yapmalısınız.')
      return
    }

    if (!shiftForm.counterpartUsername) {
      setShiftMessage('Karşı personel seçmelisiniz.')
      return
    }

    if (!shiftForm.myShiftDate) {
      setShiftMessage('Değiştirmek istediğiniz kendi gününüzü seçmelisiniz.')
      return
    }

    if (!shiftForm.swapDate) {
      setShiftMessage('Karşı personelin gününü seçmelisiniz.')
      return
    }

    const selectedColleague = departmentColleagues.find(
      (colleague) => colleague.username === shiftForm.counterpartUsername,
    )

    setShiftSubmitting(true)

    try {
      const response = await fetch(`${API_URL}/shift`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: loggedUser.username,
          counterpartUsername: shiftForm.counterpartUsername,
          myShiftDate: shiftForm.myShiftDate,
          swapDate: shiftForm.swapDate,
          description: shiftForm.description,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Vardiya değişim talebi gönderilemedi.')
      }

      await fetchShiftRequests(loggedUser.username)

      setShiftMessage(
        `${shiftForm.myShiftDate} gününüz için talep oluşturuldu. Önce ${selectedColleague?.full_name || shiftForm.counterpartUsername} onaylayacak, ardından admin onayı beklenecek.`,
      )
      setShiftForm({
        counterpartUsername: '',
        myShiftDate: '',
        swapDate: '',
        description: '',
      })
    } catch (error) {
      setShiftMessage(error instanceof Error ? error.message : 'Vardiya değişim talebi gönderilemedi.')
    } finally {
      setShiftSubmitting(false)
    }
  }

  const handlePeerShiftAction = async (id, action) => {
    if (!loggedUser?.username) {
      return
    }

    setShiftSubmitting(true)
    setShiftMessage('')

    try {
      const response = await fetch(`${API_URL}/shift/${id}/peer-${action}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: loggedUser.username }),
      })
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'İşlem başarısız.')
      }

      await fetchShiftRequests(loggedUser.username)
      setShiftMessage(
        action === 'approve'
          ? 'Onayınız kaydedildi. Talep admin onayına iletildi.'
          : 'Talep reddedildi.',
      )
    } catch (error) {
      setShiftMessage(error instanceof Error ? error.message : 'İşlem başarısız.')
    } finally {
      setShiftSubmitting(false)
    }
  }

  const getShiftStatusClass = (status) => {
    if (
      status === 'Personel Onayı Bekliyor' ||
      status === 'Admin Onayı Bekliyor' ||
      status === 'Bekliyor'
    ) {
      return 'warning'
    }
    if (status === 'Onaylandı') {
      return 'success'
    }
    return 'danger'
  }

  const handleOvertimeFormChange = (event) => {
    const { name, value } = event.target
    setOvertimeForm((previous) => ({ ...previous, [name]: value }))
  }

  const handleOvertimeSubmit = async (event) => {
    event.preventDefault()
    setOvertimeMessage('')

    if (!loggedUser?.username) {
      setOvertimeMessage('Önce giriş yapmalısınız.')
      return
    }

    if (!overtimeForm.overtimeDate) {
      setOvertimeMessage('Fazla mesai tarihi seçmelisiniz.')
      return
    }

    const hours = Number(overtimeForm.overtimeHours)
    if (!overtimeForm.overtimeHours || Number.isNaN(hours) || hours <= 0) {
      setOvertimeMessage('Geçerli bir fazla mesai süresi girmelisiniz.')
      return
    }

    if (!overtimeForm.overtimeReason.trim()) {
      setOvertimeMessage('Fazla mesai nedenini yazmalısınız.')
      return
    }

    setOvertimeSubmitting(true)

    try {
      const response = await fetch(`${API_URL}/overtime`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: loggedUser.username,
          overtimeDate: overtimeForm.overtimeDate,
          overtimeHours: hours,
          reason: overtimeForm.overtimeReason,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Fazla mesai bildirimi gönderilemedi.')
      }

      await fetchOvertimeRequests(loggedUser.username)

      setOvertimeMessage(
        `${overtimeForm.overtimeDate} tarihli ${hours} saatlik fazla mesai bildiriminiz alındı.`,
      )
      setOvertimeForm({
        overtimeDate: '',
        overtimeHours: '',
        overtimeReason: '',
      })
    } catch (error) {
      setOvertimeMessage(
        error instanceof Error ? error.message : 'Fazla mesai bildirimi gönderilemedi.',
      )
    } finally {
      setOvertimeSubmitting(false)
    }
  }

  const handleLeaveSubmit = async (event) => {
    event.preventDefault()

    if (!loggedUser?.username) {
      setLeaveMessage('Önce giriş yapmalısınız.')
      return
    }

    setLeaveSubmitting(true)
    setLeaveMessage('')

    try {
      const response = await fetch(`${API_URL}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: loggedUser.username,
          leaveType: leaveForm.leaveType,
          startDate: leaveForm.startDate,
          endDate: leaveForm.endDate,
          description: leaveForm.description,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'İzin talebi gönderilemedi.')
      }

      await fetchLeaveRequests(loggedUser.username)
      setLeaveMessage('İzin talebiniz başarıyla gönderildi.')
      setLeaveForm({
        leaveType: 'Yıllık izin',
        startDate: '',
        endDate: '',
        description: '',
      })
    } catch (error) {
      setLeaveMessage(error instanceof Error ? error.message : 'İzin talebi gönderilemedi.')
    } finally {
      setLeaveSubmitting(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (view === 'login' || view === 'admin-login' || view === 'supervisor-login') {
      try {
        const response = await fetch(`${API_URL}/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: formData.username,
            password: formData.password,
          }),
        })

        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Giriş başarısız.')
        }

        const user = {
          id: result.data.id,
          username: result.data.username,
          fullName: result.data.full_name || result.data.fullName || '',
          department: result.data.department || '',
          role: result.data.role || 'user',
        }

        if (user.role === 'admin') {
          if (view === 'supervisor-login') {
            throw new Error('Bu hesap birim sorumlusu yetkisine sahip değil.')
          }

          setAdminUser(user)
          setIsAdminLoggedIn(true)
          localStorage.setItem('puantajAdmin', JSON.stringify(user))
          localStorage.removeItem('puantajUser')
          localStorage.removeItem('puantajSupervisor')
          setStatus('Admin paneline yönlendiriliyorsunuz.')
          return
        }

        if (user.role === 'supervisor') {
          if (view === 'admin-login') {
            throw new Error('Bu hesap admin yetkisine sahip değil.')
          }

          setSupervisorUser(user)
          setIsSupervisorLoggedIn(true)
          localStorage.setItem('puantajSupervisor', JSON.stringify(user))
          localStorage.removeItem('puantajUser')
          localStorage.removeItem('puantajAdmin')
          setStatus('Birim sorumlusu paneline yönlendiriliyorsunuz.')
          return
        }

        if (view === 'admin-login') {
          throw new Error('Bu hesap admin yetkisine sahip değil.')
        }

        if (view === 'supervisor-login') {
          throw new Error('Bu hesap birim sorumlusu yetkisine sahip değil.')
        }

        setLoggedUser(user)
        localStorage.setItem('puantajUser', JSON.stringify(user))
        localStorage.removeItem('puantajAdmin')
        localStorage.removeItem('puantajSupervisor')
        await fetchAttendanceHistory(user.username)
        await fetchLeaveRequests(user.username)
        setStatus('Giriş işlemi başarılı. Portalınıza yönlendiriliyorsunuz.')
        setIsLoggedIn(true)
        return
      } catch (error) {
        setStatus(error.message)
        return
      }
    }

    if (view === 'register') {
      try {
        const response = await fetch(`${API_URL}/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: formData.username,
            fullName: formData.fullName,
            department: formData.department,
            password: formData.password,
          }),
        })

        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Kayıt başarısız.')
        }

        setStatus('Kayıt işlemi oluşturuldu. Hesabınız onaylandıktan sonra giriş yapabilirsiniz.')
        setView('login')
        return
      } catch (error) {
        setStatus(error.message)
        return
      }
    }

    setStatus('Şifre sıfırlama linki kullanıcı adınıza göre gönderildi.')
  }

  const renderHeader = () => {
    if (view === 'login') {
      return (
        <>
          <p className="eyebrow accent">Hoş geldiniz</p>
          <h3>Giriş yap</h3>
        </>
      )
    }

    if (view === 'admin-login') {
      return (
        <>
          <p className="eyebrow accent">Yönetim</p>
          <h3>Admin girişi</h3>
        </>
      )
    }

    if (view === 'supervisor-login') {
      return (
        <>
          <p className="eyebrow accent">Birim</p>
          <h3>Birim sorumlusu girişi</h3>
        </>
      )
    }

    if (view === 'register') {
      return (
        <>
          <p className="eyebrow accent">Yeni hesap</p>
          <h3>Kayıt ol</h3>
        </>
      )
    }

    return (
      <>
        <p className="eyebrow accent">Güvenlik</p>
        <h3>Şifremi unuttum</h3>
      </>
    )
  }

  const renderForm = () => {
    if (view === 'register') {
      return (
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Ad soyad
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleInputChange}
              placeholder="Ayşe Kaya"
              required
            />
          </label>

          <label>
            Departman
            <select
              name="department"
              value={formData.department}
              onChange={handleInputChange}
              required
            >
              <option value="">Departman seçin</option>
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </label>

          <label>
            Kullanıcı adı
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              placeholder="aysekaya"
              required
            />
          </label>

          <label>
            Şifre
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="En az 8 karakter"
              minLength={8}
              required
            />
          </label>

          <label>
            Şifre tekrar
            <input
              type="password"
              name="passwordRepeat"
              value={formData.passwordRepeat || ''}
              onChange={handleInputChange}
              placeholder="Şifreyi tekrar girin"
              minLength={8}
              required
            />
          </label>

          <button type="submit" className="primary-button">
            Kayıt ol
          </button>
        </form>
      )
    }

    if (view === 'forgot') {
      return (
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Kullanıcı adı
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              placeholder="aysekaya"
              required
            />
          </label>

          <button type="submit" className="primary-button">
            Şifre sıfırla
          </button>
        </form>
      )
    }

    if (view === 'admin-login') {
      return (
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Admin kullanıcı adı
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              placeholder="admin"
              required
            />
          </label>

          <label>
            Şifre
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="••••••••"
              minLength={8}
              required
            />
          </label>

          <button type="submit" className="primary-button">
            Admin girişi yap
          </button>
        </form>
      )
    }

    if (view === 'supervisor-login') {
      return (
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Birim sorumlusu kullanıcı adı
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              placeholder="birimsorumlu"
              required
            />
          </label>

          <label>
            Şifre
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="••••••••"
              minLength={8}
              required
            />
          </label>

          <button type="submit" className="primary-button">
            Birim sorumlusu girişi yap
          </button>
        </form>
      )
    }

    return (
      <form className="login-form" onSubmit={handleSubmit}>
        <label>
          Kullanıcı adı
          <input
            type="text"
            name="username"
            value={formData.username}
            onChange={handleInputChange}
            required
          />
        </label>

        <label>
          Şifre
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            required
          />
        </label>

        <div className="form-row">
          <label className="checkbox">
            <input type="checkbox" defaultChecked />
            Beni hatırla
          </label>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setView('forgot')
              setStatus('')
            }}
          >
            Şifremi unuttum
          </button>
        </div>

        <button type="submit" className="primary-button">
          Giriş yap
        </button>
      </form>
    )
  }

  const renderAnnualLeaveBalance = () => (
    <div className="panel" style={{ gridColumn: '1 / -1' }}>
      <div className="panel-header">
        <h3>Kalan Yıllık İzin ({leaveBalance?.year || 2026})</h3>
        <span className="status-badge light">
          {leaveBalance?.eligible ? `${leaveBalance.remainingDays} gün` : '0 gün'}
        </span>
      </div>

      <div className="summary-card" style={{ marginBottom: leaveBalance && !leaveBalance.eligible ? 16 : 0 }}>
        <div>
          <span>Hak edilen</span>
          <strong>{leaveBalance?.eligible ? `${leaveBalance.entitlementDays} gün` : '0 gün'}</strong>
        </div>
        <div>
          <span>Kullanılan</span>
          <strong>{leaveBalance ? `${leaveBalance.usedDays} gün` : '0 gün'}</strong>
        </div>
        <div>
          <span>Kalan</span>
          <strong>{leaveBalance?.eligible ? `${leaveBalance.remainingDays} gün` : '0 gün'}</strong>
        </div>
      </div>

      {leaveBalance && !leaveBalance.eligible && (
        <Alert severity="warning" variant="filled" sx={{ borderRadius: 2, fontWeight: 600 }}>
           Henüz 1 yıllık kıdemi doldurmadığınız için bu yıl yıllık izin hak etmediniz.
        </Alert>
      )}
    </div>
  )

  const renderPortalContent = () => {
    if (activeMenu === 'İzinlerim') {
      return (
        <section className="portal-grid top-grid">
          {renderAnnualLeaveBalance()}

          <div className="panel">
            <div className="panel-header">
              <h3>İzinlerim</h3>
              <span className="status-badge light">{leaveRows.length}</span>
            </div>

            <ul className="table-list">
              {leaveRows.length > 0 ? (
                leaveRows.map((row) => (
                  <li key={row.id}>
                    <span>{row.type}</span>
                    <strong>{row.days}</strong>
                    <em
                      className={
                        row.status === 'Onaylandı'
                          ? 'success'
                          : row.status === 'İnceleniyor'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {row.status}
                    </em>
                  </li>
                ))
              ) : (
                <li>
                  <span>Henüz izin kaydı yok</span>
                  <strong>-</strong>
                  <em className="warning">Boş</em>
                </li>
              )}
            </ul>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Özet</h3>
              <span className="status-badge online">Durum</span>
            </div>

            <div className="summary-card">
              <div>
                <span>Toplam</span>
                <strong>{leaveRequests.length}</strong>
              </div>
              <div>
                <span>Bekleyen</span>
                <strong>{pendingLeaveCount}</strong>
              </div>
              <div>
                <span>Onaylanan</span>
                <strong>{leaveRequests.filter((item) => item.status === 'Onaylandı').length}</strong>
              </div>
              <div>
                <span>Reddedilen</span>
                <strong>{leaveRequests.filter((item) => item.status === 'Reddedildi').length}</strong>
              </div>
            </div>
          </div>
        </section>
      )
    }

    if (activeMenu === 'İzin Talebi') {
      return (
        <>
          <section className="portal-grid top-grid">
            {renderAnnualLeaveBalance()}

            <div className="panel">
              <div className="panel-header">
                <h3>İzin Talebi</h3>
                <span className="status-badge online">Açık</span>
              </div>

              <form className="portal-form" onSubmit={handleLeaveSubmit}>
                <label>
                  İzin türü
                  <select
                    name="leaveType"
                    value={leaveForm.leaveType}
                    onChange={handleLeaveFormChange}
                    required
                  >
                    {leaveTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Başlangıç tarihi
                  <input
                    type="date"
                    name="startDate"
                    value={leaveForm.startDate}
                    onChange={handleLeaveFormChange}
                    required
                  />
                </label>
                <label>
                  Bitiş tarihi
                  <input
                    type="date"
                    name="endDate"
                    value={leaveForm.endDate}
                    onChange={handleLeaveFormChange}
                    required
                  />
                </label>
                <label>
                  Açıklama
                  <textarea
                    name="description"
                    rows="4"
                    value={leaveForm.description}
                    onChange={handleLeaveFormChange}
                    placeholder="İzin talebinizin açıklamasını yazın."
                  />
                </label>
                <button
                  type="submit"
                  className="primary-button small-button form-submit"
                  disabled={leaveSubmitting}
                >
                  {leaveSubmitting ? 'Gönderiliyor...' : 'Talep Gönder'}
                </button>
                {leaveMessage && <p className="auth-message">{leaveMessage}</p>}
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h3>Bekleyen Talepler</h3>
                <span className="status-badge light">{pendingLeaveCount}</span>
              </div>

              <ul className="table-list">
                {leaveRequests.length > 0 ? (
                  leaveRequests.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.leave_type}</strong>
                        <span>{formatLeaveDateRange(item.start_date, item.end_date)}</span>
                      </div>
                      <strong>{calculateLeaveDays(item.start_date, item.end_date)}</strong>
                      <em
                        className={
                          item.status === 'Onaylandı'
                            ? 'success'
                            : item.status === 'İnceleniyor'
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {item.status}
                      </em>
                    </li>
                  ))
                ) : (
                  <li>
                    <div>
                      <strong>Henüz talep yok</strong>
                      <span>İzin talebi oluşturarak başlayın</span>
                    </div>
                  </li>
                )}
              </ul>
            </div>
          </section>
        </>
      )
    }

    if (activeMenu === 'Molalarım') {
      return (
        <section className="portal-grid top-grid">
          <div className="panel">
            <div className="panel-header">
              <h3>Molalarım</h3>
              <span className="status-badge light">{breakRecords.length}</span>
            </div>

            <ul className="record-list">
              {breakRecords.length > 0 ? (
                breakRecords.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.time}</span>
                    </div>
                    <div className="record-meta">
                      <em>{item.status}</em>
                    </div>
                  </li>
                ))
              ) : (
                <li>
                  <div>
                    <strong>Henüz mola kaydı yok.</strong>
                    <span>Bu hafta kayıtlı mola bulunmuyor.</span>
                  </div>
                </li>
              )}
            </ul>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Haftalık Özet</h3>
              <span className="status-badge light">0</span>
            </div>

            <div className="summary-card">
              <div>
                <span>Toplam mola</span>
                <strong>0dk</strong>
              </div>
              <div>
                <span>Ortalama</span>
                <strong>0dk</strong>
              </div>
              <div>
                <span>Durum</span>
                <strong>Veri yok</strong>
              </div>
            </div>
          </div>
        </section>
      )
    }

    if (activeMenu === 'Eğitimlerim') {
      const trainings = []
      const waitingCount = trainings.filter((item) => item.status === 'Bekliyor').length
      const completedCount = trainings.filter((item) => item.status === 'Tamamlandı').length

      return (
        <section className="portal-grid top-grid">
          <div className="panel" style={{ gridColumn: '1 / -1' }}>
            <div className="panel-header">
              <h3>🎓 Eğitimlerim</h3>
              <span className="status-badge light">{trainings.length}</span>
            </div>

            <p style={{ marginBottom: 16, fontWeight: 700, color: '#111827' }}>
              Size atanan eğitimleri tamamlayın, sınavlara girin ve sertifikalarınızı buradan indirin.
            </p>

            <div className="summary-card">
              <div>
                <span>Toplam</span>
                <strong>{trainings.length}</strong>
              </div>
              <div>
                <span>Bekliyor</span>
                <strong>{waitingCount}</strong>
              </div>
              <div>
                <span>Tamamlandı</span>
                <strong>{completedCount}</strong>
              </div>
            </div>
          </div>

          <div className="panel" style={{ gridColumn: '1 / -1' }}>
            <div className="panel-header">
              <h3>Eğitim İçeriği</h3>
              <span className="status-badge online">Liste</span>
            </div>

            <ul className="table-list">
              <li>
                <span style={{ fontWeight: 700, color: '#111827' }}>
                  Henüz size atanmış eğitim bulunmuyor.
                </span>
                <strong>-</strong>
                <em className="warning">Boş</em>
              </li>
            </ul>
          </div>
        </section>
      )
    }

    if (activeMenu === 'Mesajlar') {
      return (
        <section className="portal-grid top-grid">
          <div className="panel" style={{ gridColumn: '1 / -1' }}>
            <div
              className="panel-header"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3>Mesajlar</h3>
                <span className="status-badge light">{activeChatMessages.length}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="status-badge online">{departmentGroupName}</span>
                <button
                  type="button"
                  className="secondary-button small-button"
                  onClick={() => setShowNewMessageModal(true)}
                  style={{ minWidth: 120 }}
                >
                  Yeni Mesaj
                </button>
                <button
                  type="button"
                  className="secondary-button small-button"
                  onClick={() => setShowMemberForm((current) => !current)}
                  style={{ minWidth: 140 }}
                >
                  Yeni Üye Ekle
                </button>
              </div>
            </div>

            {showNewMessageModal && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(15, 23, 42, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2000,
                  padding: 20,
                }}
                onClick={() => setShowNewMessageModal(false)}
              >
                <div
                  style={{
                    width: '100%',
                    maxWidth: 560,
                    background: '#ffffff',
                    borderRadius: 18,
                    boxShadow: '0 18px 50px rgba(15, 23, 42, 0.22)',
                    padding: 20,
                    border: '1px solid #e5e7eb',
                  }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 16,
                    }}
                  >
                    <h4 style={{ margin: 0, color: '#111827', fontSize: 20 }}>Yeni Mesaj</h4>
                    <button
                      type="button"
                      className="ghost-button small-button"
                      onClick={() => setShowNewMessageModal(false)}
                    >
                      Kapat
                    </button>
                  </div>

                  <div style={{ display: 'grid', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                    {departmentMembers.length > 0 ? (
                      departmentMembers.map((person) => (
                        <button
                          key={person.id || person.username}
                          type="button"
                          onClick={() => {
                            const name = person.full_name || person.username
                            setSelectedChatUser(person)
                            setShowNewMessageModal(false)
                            setTrainingMessageDraft((current) => {
                              if (!current) {
                                return `Merhaba ${name}, `
                              }
                              return current
                            })
                          }}
                          style={{
                            padding: '12px 14px',
                            borderRadius: 12,
                            border: '1px solid #d1d5db',
                            background: '#f9fafb',
                            textAlign: 'left',
                            color: '#111827',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {person.full_name || person.username}
                        </button>
                      ))
                    ) : (
                      <div style={{ color: '#6b7280', fontSize: 14 }}>
                        Bu departmanda kayıtlı üye bulunmuyor.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {showMemberForm && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(15, 23, 42, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2000,
                  padding: 20,
                }}
                onClick={() => setShowMemberForm(false)}
              >
                <div
                  style={{
                    width: '100%',
                    maxWidth: 620,
                    background: '#ffffff',
                    borderRadius: 18,
                    boxShadow: '0 18px 50px rgba(15, 23, 42, 0.22)',
                    padding: 20,
                    border: '1px solid #e5e7eb',
                  }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 16,
                      gap: 12,
                    }}
                  >
                    <h4 style={{ margin: 0, color: '#111827', fontSize: 20 }}>Yeni Üye Ekle</h4>
                    <button
                      type="button"
                      onClick={() => setShowMemberForm(false)}
                      className="ghost-button small-button"
                    >
                      Kapat
                    </button>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                      Departman üyeleri: {departmentGroupName}
                    </div>

                    <div style={{ display: 'grid', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                      {departmentMembers.length > 0 ? (
                        departmentMembers.map((person) => (
                          <button
                            key={person.id || person.username}
                            type="button"
                            onClick={() => {
                              setMemberForm({ fullName: person.full_name || person.username })
                              setShowMemberForm(false)
                            }}
                            style={{
                              padding: '10px 12px',
                              borderRadius: 10,
                              border: '1px solid #d1d5db',
                              background: '#f9fafb',
                              textAlign: 'left',
                              color: '#111827',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {person.full_name || person.username}
                          </button>
                        ))
                      ) : (
                        <div style={{ color: '#6b7280', fontSize: 14 }}>
                          Bu departmanda kayıtlı üye bulunmuyor.
                        </div>
                      )}
                    </div>
                  </div>

                  <form onSubmit={handleMemberSubmit} style={{ display: 'grid', gap: 12 }}>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <label style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Ad Soyad</label>
                      <input
                        type="text"
                        name="fullName"
                        value={memberForm.fullName}
                        onChange={handleMemberFormChange}
                        placeholder="Ad Soyad"
                        required
                        style={{ borderRadius: 10, border: '1px solid #d1d5db', padding: '10px 12px', fontSize: 14 }}
                      />
                    </div>

                    {memberMessage && (
                      <div style={{ color: memberMessage.includes('başarıyla') || memberMessage.includes('oluşturuldu') ? '#065f46' : '#b91c1c', fontSize: 13, fontWeight: 600 }}>
                        {memberMessage}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                      <button
                        type="button"
                        className="ghost-button small-button"
                        onClick={() => setShowMemberForm(false)}
                      >
                        İptal
                      </button>
                      <button
                        type="submit"
                        className="primary-button small-button"
                        disabled={memberSubmitting}
                        style={{ minWidth: 140 }}
                      >
                        {memberSubmitting ? 'Kaydediliyor...' : 'Üye Ekle'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '260px minmax(0, 1fr)',
                gap: 18,
                minHeight: 430,
              }}
            >
              <aside
                style={{
                  borderRight: '1px solid #e5e7eb',
                  paddingRight: 12,
                  minHeight: 420,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: '#374151',
                    letterSpacing: 0.2,
                    marginBottom: 12,
                    textTransform: 'uppercase',
                  }}
                >
                  Kişiler
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  {departmentMembers.length > 0 ? (
                    departmentMembers.map((person) => {
                      const isSelected =
                        selectedChatUser &&
                        (selectedChatUser.username || selectedChatUser.full_name) ===
                          (person.username || person.full_name)

                      return (
                        <button
                          key={person.id || person.username}
                          type="button"
                          onClick={() => setSelectedChatUser(person)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderRadius: 12,
                            border: isSelected ? '1px solid #93c5fd' : '1px solid #e5e7eb',
                            background: isSelected ? '#eff6ff' : '#ffffff',
                            color: '#111827',
                            padding: '10px 12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <span>{person.full_name || person.username}</span>
                          <span
                            style={{
                              fontSize: 11,
                              color: isSelected ? '#1d4ed8' : '#6b7280',
                              fontWeight: 700,
                            }}
                          >
                            {isSelected ? 'Aktif' : 'İleti'}
                          </span>
                        </button>
                      )
                    })
                  ) : (
                    <div style={{ color: '#6b7280', fontSize: 14 }}>
                      Bu departmanda kayıtlı üye bulunmuyor.
                    </div>
                  )}
                </div>
              </aside>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    paddingBottom: 12,
                    borderBottom: '1px solid #e5e7eb',
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Kullanıcı</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>
                      {selectedChatLabel}
                    </div>
                  </div>
                  <span className="status-badge online">{selectedChatUser ? 'Aktif' : departmentGroupName}</span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    maxHeight: 360,
                    overflowY: 'auto',
                    paddingRight: 8,
                  }}
                >
                  {activeChatMessages.map((message) => {
                    const mine = (message.sender || 'Sen') === currentUserDisplayName

                    return (
                      <div
                        key={message.id}
                        style={{
                          alignSelf: mine ? 'flex-end' : 'flex-start',
                          maxWidth: '75%',
                          background: mine ? '#dbeafe' : '#f3f4f6',
                          color: '#111827',
                          borderRadius: 14,
                          padding: '10px 12px',
                          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            marginBottom: 4,
                            color: '#374151',
                          }}
                        >
                          {message.sender}
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.5 }}>{message.text}</div>
                        <div
                          style={{
                            fontSize: 11,
                            color: '#6b7280',
                            marginTop: 6,
                            textAlign: 'right',
                          }}
                        >
                          {message.time}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    marginTop: 16,
                    alignItems: 'stretch',
                  }}
                >
                  <textarea
                    value={trainingMessageDraft}
                    onChange={(event) => setTrainingMessageDraft(event.target.value)}
                    placeholder={`Mesaj yazın - ${selectedChatLabel}`}
                    rows={3}
                    style={{
                      flex: 1,
                      minHeight: 80,
                      maxHeight: 140,
                      resize: 'vertical',
                      borderRadius: 12,
                      border: '1px solid #d1d5db',
                      padding: '12px 14px',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      outline: 'none',
                      lineHeight: 1.5,
                    }}
                  />
                  <button
                    type="button"
                    className="primary-button small-button"
                    style={{
                      alignSelf: 'stretch',
                      minWidth: 100,
                      height: 'auto',
                      padding: '10px 16px',
                      borderRadius: 12,
                    }}
                    onClick={handleSendTrainingMessage}
                  >
                    Gönder
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )
    }

    if (activeMenu === 'Vardiya Değişimi') {
      const outgoingRequests = shiftRequests.filter((item) => item.direction !== 'incoming')
      const incomingRequests = shiftRequests.filter((item) => item.direction === 'incoming')

      return (
        <section className="portal-grid top-grid">
          <div className="panel">
            <div className="panel-header">
              <h3>Bana Gelen Talepler</h3>
              <span className="status-badge light">{incomingRequests.length}</span>
            </div>

            <ul className="table-list">
              {incomingRequests.length > 0 ? (
                incomingRequests.map((item) => (
                  <li key={`in-${item.id}`}>
                    <div>
                      <span>{item.requester_name || item.username}</span>
                      <strong>
                        {item.my_shift_date} → {item.swap_date}
                      </strong>
                    </div>
                    {item.status === 'Personel Onayı Bekliyor' || item.status === 'Bekliyor' ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          className="primary-button small-button"
                          disabled={shiftSubmitting}
                          onClick={() => handlePeerShiftAction(item.id, 'approve')}
                        >
                          Onayla
                        </button>
                        <button
                          type="button"
                          className="ghost-button small-button"
                          disabled={shiftSubmitting}
                          onClick={() => handlePeerShiftAction(item.id, 'reject')}
                        >
                          Reddet
                        </button>
                      </div>
                    ) : (
                      <em className={getShiftStatusClass(item.status)}>{item.status}</em>
                    )}
                  </li>
                ))
              ) : (
                <li>
                  <span>Size gelen vardiya değişim talebi yok.</span>
                </li>
              )}
            </ul>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Gönderdiğim Talepler</h3>
              <span className="status-badge light">{outgoingRequests.length}</span>
            </div>

            <ul className="table-list">
              {outgoingRequests.length > 0 ? (
                outgoingRequests.map((item) => (
                  <li key={`out-${item.id}`}>
                    <div>
                      <span>{item.counterpart_name || item.counterpart_username}</span>
                      <strong>
                        {item.my_shift_date} → {item.swap_date}
                      </strong>
                    </div>
                    <em className={getShiftStatusClass(item.status)}>{item.status}</em>
                  </li>
                ))
              ) : (
                <li>
                  <span>Henüz vardiya değişim talebi yok.</span>
                </li>
              )}
            </ul>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Değişim Talebi</h3>
              <span className="status-badge online">Yeni</span>
            </div>

            <p className="eyebrow accent" style={{ marginBottom: 12 }}>
              Akış: Personel onayı → Admin onayı → Vardiya otomatik değişir
            </p>

            <form className="portal-form" onSubmit={handleShiftSubmit}>
              <label>
                Karşı personel
                <select
                  name="counterpartUsername"
                  value={shiftForm.counterpartUsername}
                  onChange={handleShiftFormChange}
                  required
                >
                  <option value="">Personel seçin</option>
                  {departmentColleagues.map((colleague) => (
                    <option key={colleague.username} value={colleague.username}>
                      {`${colleague.full_name} (${colleague.department})`}
                    </option>
                  ))}
                </select>
              </label>
              {departmentColleagues.length === 0 && (
                <p className="auth-message">
                  {loggedUser?.department
                    ? 'Aynı birimde başka kayıtlı personel bulunamadı.'
                    : 'Hesabınızda birim bilgisi yok. Vardiya değişimi için biriminizin tanımlı olması gerekir.'}
                </p>
              )}

              <p className="eyebrow accent">Benim günüm</p>
              <label>
                Hangi günümü değiştirmek istiyorum?
                <input
                  type="date"
                  name="myShiftDate"
                  value={shiftForm.myShiftDate}
                  onChange={handleShiftFormChange}
                  required
                />
              </label>

              <label>
                Hangi günüyle değişmek istiyorum?
                <input
                  type="date"
                  name="swapDate"
                  value={shiftForm.swapDate}
                  onChange={handleShiftFormChange}
                  required
                />
              </label>
              <label>
                Not
                <textarea
                  name="description"
                  rows="4"
                  value={shiftForm.description}
                  onChange={handleShiftFormChange}
                  placeholder="Vardiya değişim talebinizin açıklamasını yazın."
                />
              </label>
              <button
                type="submit"
                className="primary-button small-button form-submit"
                disabled={shiftSubmitting}
              >
                {shiftSubmitting ? 'Gönderiliyor...' : 'Talep Gönder'}
              </button>
              {shiftMessage && <p className="auth-message">{shiftMessage}</p>}
            </form>
          </div>
        </section>
      )
    }

    if (activeMenu === 'Fazla Mesai Bildir') {
      return (
        <section className="portal-grid top-grid">
          <div className="panel">
            <div className="panel-header">
              <h3>Fazla Mesai</h3>
              <span className="status-badge light">{overtimeRequests.length}</span>
            </div>

            <ul className="table-list">
              {overtimeRequests.length > 0 ? (
                overtimeRequests.map((item) => (
                  <li key={item.id}>
                    <div>
                      <span>{item.overtime_date}</span>
                      <strong>{item.overtime_hours} saat</strong>
                    </div>
                    <em className={item.status === 'Bekliyor' ? 'warning' : 'success'}>
                      {item.status}
                    </em>
                  </li>
                ))
              ) : (
                <li>
                  <span>Henüz fazla mesai bildirimi yok.</span>
                </li>
              )}
            </ul>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Fazla Mesai Bildirimi</h3>
              <span className="status-badge light">Yeni</span>
            </div>

            <form className="portal-form" onSubmit={handleOvertimeSubmit}>
              <label>
                Fazla Mesai Tarihi
                <input
                  type="date"
                  name="overtimeDate"
                  value={overtimeForm.overtimeDate}
                  onChange={handleOvertimeFormChange}
                  required
                />
              </label>
              <label>
                Fazla Mesai Süresi (Saat)
                <input
                  type="number"
                  name="overtimeHours"
                  value={overtimeForm.overtimeHours}
                  onChange={handleOvertimeFormChange}
                  min="0.5"
                  step="0.5"
                  placeholder="Örn: 2"
                  required
                />
              </label>
              <label>
                Fazla Mesai Nedeni
                <textarea
                  name="overtimeReason"
                  rows="4"
                  value={overtimeForm.overtimeReason}
                  onChange={handleOvertimeFormChange}
                  placeholder="Fazla mesai nedeninizi yazın."
                  required
                />
              </label>
              <p className="form-footnote">
                🏖 Departmanınız fazla mesaiyi ücret olarak değil izin hakkı olarak kullanmaktadır.
                Onaylandıktan sonra izin bakiyenize eklenecektir.
              </p>
              <button
                type="submit"
                className="primary-button small-button form-submit"
                disabled={overtimeSubmitting}
              >
                {overtimeSubmitting ? 'Gönderiliyor...' : 'Bildir'}
              </button>
              {overtimeMessage && <p className="auth-message">{overtimeMessage}</p>}
            </form>
          </div>
        </section>
      )
    }

    if (activeMenu === 'QR Giriş/Çıkış') {
      return (
        <section className="portal-grid top-grid">
          <div className="panel">
            <div className="panel-header">
              <h3>QR Giriş / Çıkış</h3>
              <span className="status-badge online">Aktif</span>
            </div>

            <div className="qr-grid">
              <div className="qr-box large-qr">
                {qrImage.checkin ? (
                  <img src={qrImage.checkin} alt="Giriş QR kodu" className="qr-image" />
                ) : (
                  <div className="qr-image placeholder">QR</div>
                )}
                <div className="qr-code-value">{qrCodes.checkin}</div>
              </div>

              <div className="qr-box large-qr">
                {qrImage.checkout ? (
                  <img src={qrImage.checkout} alt="Çıkış QR kodu" className="qr-image" />
                ) : (
                  <div className="qr-image placeholder">QR</div>
                )}
                <div className="qr-code-value">{qrCodes.checkout}</div>
              </div>
            </div>

            <div className="qr-actions">
              <button
                type="button"
                className="primary-button small-button"
                onClick={() => {
                  setCameraMode('checkin')
                  setCameraMessage('Giriş QR kodu için kamera açılıyor...')
                  setCameraOpen(true)
                }}
              >
                Giriş QR Oku
              </button>
              <button
                type="button"
                className="secondary-button small-button"
                onClick={() => {
                  setCameraMode('checkout')
                  setCameraMessage('Çıkış QR kodu için kamera açılıyor...')
                  setCameraOpen(true)
                }}
              >
                Çıkış QR Oku
              </button>
            </div>

            {cameraOpen && (
              <div className="camera-panel">
                <div className="camera-status">{cameraMessage}</div>
                <video ref={videoRef} autoPlay playsInline muted className="camera-video" />

                <label className="qr-scan-field">
                  Okunan QR değeri
                  <input
                    type="text"
                    value={scannedQrCode}
                    onChange={(event) => setScannedQrCode(event.target.value)}
                    placeholder="PUANTAJ-GIRIS-2026"
                  />
                </label>

                <div className="camera-actions">
                  <button
                    type="button"
                    className="primary-button small-button"
                    onClick={() => handleQrScan(normalizeQrValue(scannedQrCode || (cameraMode === 'checkin' ? qrCodes.checkin : qrCodes.checkout)))}
                  >
                    QR Onayla
                  </button>
                  <button type="button" className="ghost-button small-button" onClick={closeCameraDialog}>
                    Kapat
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Son Tarama</h3>
              <span className="status-badge light">Bugün</span>
            </div>

            <ul className="record-list">
              {recentScans.length > 0 ? (
                recentScans.map((log) => (
                  <li key={log.id}>
                    <div>
                      <strong>{getActionLabel(log.action)}</strong>
                      <span>{log.note || 'QR kodu ile kayıt'}</span>
                    </div>
                    <div className="record-meta">
                      <time>{formatAttendanceTime(log.created_at)}</time>
                      <em className="success">Başarılı</em>
                    </div>
                  </li>
                ))
              ) : (
                <li>
                  <div>
                    <strong>Henüz kayıt yok</strong>
                    <span>QR kod okutarak giriş/çıkış yapın</span>
                  </div>
                </li>
              )}
            </ul>
          </div>
        </section>
      )
    }

    return (
      <>
        <section className="portal-grid top-grid">
          <div className="panel qr-panel">
            <div className="panel-header">
              <h3>QR Giriş / Çıkış</h3>
              <span className="status-badge online">Aktif</span>
            </div>

            <div className="qr-grid">
              <div className="qr-box">
                {qrImage.checkin ? (
                  <img src={qrImage.checkin} alt="Giriş QR kodu" className="qr-image" />
                ) : (
                  <div className="qr-image placeholder">QR</div>
                )}
                <div className="qr-code-value">{qrCodes.checkin}</div>
              </div>

              <div className="qr-box">
                {qrImage.checkout ? (
                  <img src={qrImage.checkout} alt="Çıkış QR kodu" className="qr-image" />
                ) : (
                  <div className="qr-image placeholder">QR</div>
                )}
                <div className="qr-code-value">{qrCodes.checkout}</div>
              </div>
            </div>

            <div className="qr-actions">
              <button
                type="button"
                className="primary-button small-button"
                onClick={() => {
                  setCameraMode('checkin')
                  setCameraMessage('Giriş QR kodu için kamera açılıyor...')
                  setCameraOpen(true)
                }}
              >
                Giriş QR Oku
              </button>
              <button
                type="button"
                className="secondary-button small-button"
                onClick={() => {
                  setCameraMode('checkout')
                  setCameraMessage('Çıkış QR kodu için kamera açılıyor...')
                  setCameraOpen(true)
                }}
              >
                Çıkış QR Oku
              </button>
            </div>

            {cameraOpen && (
              <div className="camera-panel">
                <div className="camera-status">{cameraMessage}</div>
                <video ref={videoRef} autoPlay playsInline muted className="camera-video" />

                <label className="qr-scan-field">
                  Okunan QR değeri
                  <input
                    type="text"
                    value={scannedQrCode}
                    onChange={(event) => setScannedQrCode(event.target.value)}
                    placeholder="PUANTAJ-GIRIS-2026"
                  />
                </label>

                <div className="camera-actions">
                  <button
                    type="button"
                    className="primary-button small-button"
                    onClick={() => handleQrScan(normalizeQrValue(scannedQrCode || (cameraMode === 'checkin' ? qrCodes.checkin : qrCodes.checkout)))}
                  >
                    QR Onayla
                  </button>
                  <button type="button" className="ghost-button small-button" onClick={closeCameraDialog}>
                    Kapat
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={`panel summary-panel${showAttendanceDetail ? ' expanded' : ''}`}>
            <div className="panel-header">
              <h3>Puantajım</h3>
              <div className="panel-header-actions">
                <button
                  type="button"
                  className="secondary-button tiny-button"
                  onClick={() => setShowAttendanceDetail((previous) => !previous)}
                >
                  {showAttendanceDetail ? 'Daha az göster' : 'Daha fazla göster'}
                </button>
                <span className="status-badge muting">
                  {new Date().toLocaleDateString('tr-TR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </div>

            <div className="summary-card">
              <div>
                <span>Tarih</span>
                <strong>
                  {new Date().toLocaleDateString('tr-TR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </strong>
              </div>
              <div>
                <span>Giriş</span>
                <strong>{firstCheckinToday ? formatAttendanceTime(firstCheckinToday.created_at) : '--:--'}</strong>
              </div>
              <div>
                <span>Çıkış</span>
                <strong>{lastCheckoutToday ? formatAttendanceTime(lastCheckoutToday.created_at) : '--:--'}</strong>
              </div>
              <div>
                <span>Toplam</span>
                <strong>
                  {todayWorkTotal > 0 ? formatDuration(todayWorkTotal) : '--'}
                </strong>
              </div>
            </div>

            {showAttendanceDetail && (
              <div className="attendance-detail-wrap">
                <div className="attendance-detail-table">
                  <div className="attendance-detail-header">
                    <span>Tarih</span>
                    <span>Gün</span>
                    <span>Giriş</span>
                    <span>Çıkış</span>
                    <span>Çalışma</span>
                    <span>Durum</span>
                  </div>

                  {attendanceDetailRows.length > 0 ? (
                    attendanceDetailRows.map((row) => (
                      <div key={row.id} className="attendance-detail-row">
                        <span>{row.date}</span>
                        <span>{row.day}</span>
                        <span>{row.checkin}</span>
                        <span>{row.checkout}</span>
                        <strong>{row.work}</strong>
                        <em
                          className={
                            row.status === 'Tamamlandı'
                              ? 'success'
                              : row.status === 'Devam ediyor'
                                ? 'warning'
                                : 'danger'
                          }
                        >
                          {row.status}
                        </em>
                      </div>
                    ))
                  ) : (
                    <div className="attendance-detail-empty">
                      Henüz puantaj kaydı bulunmuyor.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="stats-grid">
          {statsCards.map((card) => (
            <div
              key={card.label}
              className={`mini-card ${card.tone}${card.clickable ? ' clickable' : ''}`}
              onClick={card.onClick}
              role={card.clickable ? 'button' : undefined}
              tabIndex={card.clickable ? 0 : undefined}
              onKeyDown={
                card.clickable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        card.onClick?.()
                      }
                    }
                  : undefined
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{card.label}</span>
                {card.clickable && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      color: card.tone === 'green' ? '#065f46' : '#b91c1c',
                      background:
                        card.tone === 'green'
                          ? 'rgba(16, 185, 129, 0.16)'
                          : 'rgba(239, 68, 68, 0.12)',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontWeight: 700,
                    }}
                  >
                    Detay Gör 🔍
                  </span>
                )}
              </div>
              <strong>{card.value}</strong>
            </div>
          ))}
        </section>

        {leaveBalance && !leaveBalance.eligible && (
          <Alert
            severity="warning"
            variant="filled"
            sx={{ mt: 2, mb: 1, borderRadius: 2, fontWeight: 600 }}
          >
            Henüz 1 yıllık kıdemi doldurmadığınız için bu yıl yıllık izin hak
          </Alert>
        )}

        <section className="content-grid">
          <div className="panel">
            <div className="panel-header">
              <h3>Bugünün Kayıtları</h3>
              <span className="status-badge light">Detay</span>
            </div>

            <ul className="record-list">
              {todayRecords.length > 0 ? (
                todayRecords.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.note}</span>
                    </div>
                    <div className="record-meta">
                      <time>{item.time}</time>
                      <em>{item.status}</em>
                    </div>
                  </li>
                ))
              ) : (
                <li>
                  <div>
                    <strong>Bugün kayıt yok</strong>
                    <span>QR kod okutarak puantaj kaydı oluşturun</span>
                  </div>
                </li>
              )}
            </ul>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>İzinlerim</h3>
              <span className="status-badge light">{leaveRows.length}</span>
            </div>

            <ul className="table-list">
              {leaveRows.length > 0 ? (
                leaveRows.map((row) => (
                  <li key={row.id}>
                    <span>{row.type}</span>
                    <strong>{row.days}</strong>
                    <em
                      className={
                        row.status === 'Onaylandı'
                          ? 'success'
                          : row.status === 'İnceleniyor'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {row.status}
                    </em>
                  </li>
                ))
              ) : (
                <li>
                  <span>Henüz izin kaydı yok</span>
                  <strong>-</strong>
                  <em className="warning">Boş</em>
                </li>
              )}
            </ul>
          </div>
        </section>

        <section className="feature-grid">
          {activityItems.map((item) => (
            <div key={item.title} className={`feature-card ${item.color}`}>
              <span>{item.title}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </section>
      </>
    )
  }

  if (isAdminLoggedIn) {
    return (
      <AdminPanel adminUser={adminUser} apiUrl={API_URL} onLogout={handleAdminLogout} />
    )
  }

  if (isSupervisorLoggedIn) {
    return (
      <SupervisorPanel
        supervisorUser={supervisorUser}
        apiUrl={API_URL}
        onLogout={handleSupervisorLogout}
      />
    )
  }

  if (isLoggedIn) {
    return (
      <div className="portal-shell">
        <aside className="portal-sidebar">
          <div className="portal-brand">
            <div className="brand-mark">P</div>
            <div>
              <p className="eyebrow">İŞ YÖNETİMİ</p>
              <h2>Puantaj</h2>
            </div>
          </div>

          <div className="profile-box">
            <div className="profile-avatar">
              {(loggedUser?.fullName || loggedUser?.username || 'U')
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div>
              <strong>{loggedUser?.fullName || loggedUser?.full_name || loggedUser?.username}</strong>
              <span>{loggedUser?.username}</span>
              {loggedUser?.department ? <span>{loggedUser.department}</span> : null}
            </div>
          </div>

          <nav className="portal-nav">
            {sidebarItems.map((item) => (
              <button
                key={item}
                type="button"
                className={activeMenu === item ? 'nav-item active' : 'nav-item'}
                onClick={() => setActiveMenu(item)}
              >
                {item}
              </button>
            ))}
          </nav>
        </aside>

        <main className="portal-main">
          <header className="portal-topbar">
            <div>
              <Alert
                severity="success"
                variant="filled"
                sx={{
                  mb: 1,
                  py: 0.5,
                  px: 1.5,
                  borderRadius: 2,
                  fontWeight: 700,
                  fontSize: '1rem',
                  width: 'fit-content',
                  maxWidth: '100%',
                }}
              >
                Merhaba,{' '}
                {(loggedUser?.fullName || loggedUser?.full_name || loggedUser?.username || '')
                  .toLocaleUpperCase('tr-TR')}
                ! 👋
              </Alert>
              <Alert
                severity="info"
                variant="outlined"
                sx={{
                  mt: 0,
                  mb: 1.5,
                  py: 0.25,
                  px: 1.5,
                  borderRadius: 2,
                  fontWeight: 600,
                  width: 'fit-content',
                  maxWidth: '100%',
                }}
              >
                {loggedUser?.department
                  ? `Departman: ${loggedUser.department}`
                  : 'Departman bilgisi tanımlı değil'}
              </Alert>
              <h1>{activeMenu}</h1>
            </div>

            <div className="topbar-actions">
              <button
                type="button"
                className="ghost-button small-button"
                onClick={handleLogout}
              >
                Çıkış
              </button>
            </div>
          </header>

          {attendanceMessage && <p className="auth-message portal-message">{attendanceMessage}</p>}

          {renderPortalContent()}
        </main>

        <Snackbar
          open={qrAlert.open}
          autoHideDuration={4500}
          onClose={(_, reason) => {
            if (reason === 'clickaway') {
              return
            }
            setQrAlert((previous) => ({ ...previous, open: false }))
          }}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          sx={{ zIndex: 99999 }}
        >
          <Alert
            onClose={() => setQrAlert((previous) => ({ ...previous, open: false }))}
            severity={qrAlert.severity}
            variant="filled"
            elevation={6}
            sx={{
              width: '100%',
              minWidth: 300,
              borderRadius: 2,
              fontWeight: 600,
              fontSize: '0.95rem',
              boxShadow: '0 10px 28px rgba(15, 23, 42, 0.22)',
            }}
          >
            {qrAlert.message}
          </Alert>
        </Snackbar>

        <Dialog
          open={showAbsenceModal}
          onClose={() => setShowAbsenceModal(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 3,
              p: 1,
              boxShadow: '0 20px 40px rgba(15, 23, 42, 0.2)',
            },
          }}
        >
          <DialogTitle
            sx={{
              fontWeight: 700,
              fontSize: '1.2rem',
              pb: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>📅 Bu Ayki Devamsızlık Detayı</span>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#64748b',
                backgroundColor: '#f1f5f9',
                padding: '4px 10px',
                borderRadius: '12px',
              }}
            >
              {monthlyStats.monthName}
            </span>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 2 }}>
            {monthlyStats.absenceDates && monthlyStats.absenceDates.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Alert
                  severity="error"
                  variant="outlined"
                  sx={{ borderRadius: 2, fontWeight: 600 }}
                >
                  Bu ay toplam <strong>{monthlyStats.absenceDays} gün</strong> puantaj kaydı veya onaylı izin bulunmayan devamsızlık tespit edildi.
                </Alert>

                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 700, color: '#475569', mt: 0.5 }}
                >
                  Devamsızlık Yapılan Tarihler:
                </Typography>

                <Box
                  component="ul"
                  sx={{
                    listStyle: 'none',
                    p: 0,
                    m: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.5,
                  }}
                >
                  {monthlyStats.absenceDates.map((item, idx) => (
                    <Box
                      component="li"
                      key={item.key}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        p: 1.5,
                        borderRadius: 2,
                        backgroundColor: '#fef2f2',
                        border: '1px solid #fecaca',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            backgroundColor: '#fee2e2',
                            color: '#b91c1c',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                          }}
                        >
                          {idx + 1}
                        </span>
                        <div>
                          <Typography
                            sx={{ fontWeight: 700, color: '#111827', fontSize: '0.95rem' }}
                          >
                            {item.dateFormatted}
                          </Typography>
                          <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>
                            {item.dayName}
                          </Typography>
                        </div>
                      </Box>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: '#b91c1c',
                          backgroundColor: '#fee2e2',
                          padding: '4px 10px',
                          borderRadius: '12px',
                        }}
                      >
                        Kayıt Yok / Devamsız
                      </span>
                    </Box>
                  ))}
                </Box>
              </Box>
            ) : (
              <Box sx={{ py: 3, textAlign: 'center' }}>
                <Alert
                  severity="success"
                  variant="filled"
                  sx={{ borderRadius: 2, fontWeight: 600, justifyContent: 'center' }}
                >
                  Tebrikler! Bu ay herhangi bir <br /> devamsızlık kaydınız bulunmamaktadır.🎉
                </Alert>
                <Typography sx={{ mt: 2, color: '#64748b', fontSize: '0.9rem' }}>
                  Tüm çalışma günlerinde puantaj kaydınız veya onaylı izin kaydınız mevcuttur.
                </Typography>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button
              onClick={() => setShowAbsenceModal(false)}
              variant="contained"
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                backgroundColor: '#2563eb',
                '&:hover': { backgroundColor: '#1d4ed8' },
              }}
            >
              Kapat
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={showWorkDaysModal}
          onClose={() => setShowWorkDaysModal(false)}
          maxWidth="md"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 3,
              p: 1,
              boxShadow: '0 20px 40px rgba(15, 23, 42, 0.2)',
            },
          }}
        >
          <DialogTitle
            sx={{
              fontWeight: 700,
              fontSize: '1.2rem',
              pb: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>📅 Bu Ayki Çalışma Günleri Detayı</span>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#64748b',
                backgroundColor: '#f1f5f9',
                padding: '4px 10px',
                borderRadius: '12px',
              }}
            >
              {monthlyStats.monthName}
            </span>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 2 }}>
            {monthlyStats.workDaysList && monthlyStats.workDaysList.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Alert
                  severity="success"
                  variant="outlined"
                  sx={{ borderRadius: 2, fontWeight: 600 }}
                >
                  Bu ay toplam <strong>{monthlyStats.workDays}</strong> kayıtlı çalışma günü bulundu. (Toplam Çalışma Süresi: <strong>{monthlyStats.totalWork}</strong>)
                </Alert>

                <Box
                  sx={{
                    overflowX: 'auto',
                    borderRadius: 2,
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      textAlign: 'left',
                      fontSize: '0.9rem',
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          backgroundColor: '#f8fafc',
                          borderBottom: '1px solid #e2e8f0',
                        }}
                      >
                        <th style={{ padding: '12px 14px', fontWeight: 700, color: '#475569' }}>
                          Tarih
                        </th>
                        <th style={{ padding: '12px 14px', fontWeight: 700, color: '#475569' }}>
                          Gün
                        </th>
                        <th style={{ padding: '12px 14px', fontWeight: 700, color: '#475569' }}>
                          Giriş
                        </th>
                        <th style={{ padding: '12px 14px', fontWeight: 700, color: '#475569' }}>
                          Çıkış
                        </th>
                        <th style={{ padding: '12px 14px', fontWeight: 700, color: '#475569' }}>
                          Çalışma Süresi
                        </th>
                        <th
                          style={{
                            padding: '12px 14px',
                            fontWeight: 700,
                            color: '#475569',
                            textAlign: 'right',
                          }}
                        >
                          Durum
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyStats.workDaysList.map((row, idx) => (
                        <tr
                          key={row.id}
                          style={{
                            borderBottom:
                              idx < monthlyStats.workDaysList.length - 1
                                ? '1px solid #f1f5f9'
                                : 'none',
                            backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                          }}
                        >
                          <td style={{ padding: '12px 14px', fontWeight: 600, color: '#1e293b' }}>
                            {row.date}
                          </td>
                          <td style={{ padding: '12px 14px', color: '#64748b' }}>{row.day}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <span
                              style={{
                                backgroundColor: '#f0fdf4',
                                color: '#166534',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontWeight: 600,
                                fontSize: '0.85rem',
                              }}
                            >
                              {row.checkin}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span
                              style={{
                                backgroundColor:
                                  row.checkout && row.checkout !== '--:--' ? '#eff6ff' : '#fef2f2',
                                color:
                                  row.checkout && row.checkout !== '--:--' ? '#1e40af' : '#991b1b',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontWeight: 600,
                                fontSize: '0.85rem',
                              }}
                            >
                              {row.checkout}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 700, color: '#1e293b' }}>
                            {row.work}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            <span
                              style={{
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                padding: '4px 10px',
                                borderRadius: '12px',
                                display: 'inline-block',
                                backgroundColor:
                                  row.status === 'Tamamlandı'
                                    ? '#dcfce7'
                                    : row.status === 'Devam ediyor'
                                      ? '#fef3c7'
                                      : '#fee2e2',
                                color:
                                  row.status === 'Tamamlandı'
                                    ? '#166534'
                                    : row.status === 'Devam ediyor'
                                      ? '#92400e'
                                      : '#991b1b',
                              }}
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              </Box>
            ) : (
              <Box sx={{ py: 3, textAlign: 'center' }}>
                <Alert
                  severity="info"
                  variant="outlined"
                  sx={{ borderRadius: 2, fontWeight: 600, justifyContent: 'center' }}
                >
                  Bu ay henüz kayıtlı çalışma günü bulunmamaktadır.
                </Alert>
                <Typography sx={{ mt: 2, color: '#64748b', fontSize: '0.9rem' }}>
                  Giriş ve çıkış QR kodlarını okutarak puantaj kaydı oluşturabilirsiniz.
                </Typography>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button
              onClick={() => setShowWorkDaysModal(false)}
              variant="contained"
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                backgroundColor: '#10b981',
                '&:hover': { backgroundColor: '#059669' },
              }}
            >
              Kapat
            </Button>
          </DialogActions>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="attendance-page">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">P</div>
          <div>
            <p className="eyebrow">İŞ YÖNETİMİ</p>
            <h1>Puantaj</h1>
          </div>
        </div>

        <div className="info-card">
          <p className="label">Bugün</p>
          <h2>19 Ağustos 2026</h2>
          <div className="stats-grid">
            <div>
              <span>Giriş</span>
              <strong>08:30</strong>
            </div>
            <div>
              <span>Çıkış</span>
              <strong>17:45</strong>
            </div>
          </div>
        </div>

        <div className="quick-access">
          <p className="label">Hızlı erişim</p>
          <ul>
            <li className="active">Giriş</li>
            <li>Mesai takibi</li>
            <li>Raporlar</li>
            <li>İzinler</li>
          </ul>
        </div>
      </aside>

      <main className="login-panel">
        <div className="topbar">
          <span className="pill online">Çevrimiçi</span>
          <button type="button" className="ghost-button">
            Yardım
          </button>
        </div>

        <div className="login-card">
          <div className="heading-wrap">{renderHeader()}</div>

          {renderForm()}

          {status && <p className="auth-message">{status}</p>}

          {view === 'login' && (
            <div className="switch-row">
              <span>Hesabın yok mu?</span>
              <button
                type="button"
                className="mini-link"
                onClick={() => {
                  setView('register')
                  setStatus('')
                }}
              >
                Kayıt ol
              </button>
            </div>
          )}

          {view === 'register' && (
            <div className="switch-row">
              <span>Zaten hesabın var mı?</span>
              <button
                type="button"
                className="mini-link"
                onClick={() => {
                  setView('login')
                  setStatus('')
                }}
              >
                Giriş yap
              </button>
            </div>
          )}

          {view === 'admin-login' && (
            <div className="switch-row">
              <span>Personel girişine dön</span>
              <button
                type="button"
                className="mini-link"
                onClick={() => {
                  setView('login')
                  setStatus('')
                }}
              >
                Giriş yap
              </button>
            </div>
          )}

          {view === 'supervisor-login' && (
            <div className="switch-row">
              <span>Personel girişine dön</span>
              <button
                type="button"
                className="mini-link"
                onClick={() => {
                  setView('login')
                  setStatus('')
                }}
              >
                Giriş yap
              </button>
            </div>
          )}

          {view === 'login' && (
            <>
              <div className="divider">
                <span>veya</span>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setView('supervisor-login')
                  setFormData((previous) => ({
                    ...previous,
                    username: 'birimsorumlu',
                    password: 'sorumlu123456',
                  }))
                  setStatus('')
                }}
              >
                Birim Sorumlusu
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setView('admin-login')
                  setStatus('')
                }}
              >
                Admin Paneli
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
