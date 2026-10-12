import { findByUsername } from '../models/User.js'
import {
  STATUS,
  createShiftRequest,
  getShiftRequestsByUsername,
  getShiftRequestById,
  updateShiftRequestFields,
  applyShiftSwapAttendance,
} from '../models/Shift.js'

const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))

const createShiftChange = async ({
  username,
  counterpartUsername,
  myShiftDate,
  swapDate,
  description = '',
}) => {
  if (!username) {
    throw new Error('Kullanıcı adı zorunludur.')
  }

  if (!counterpartUsername) {
    throw new Error('Karşı personel zorunludur.')
  }

  if (counterpartUsername === username) {
    throw new Error('Kendi adınıza vardiya değişimi talep edemezsiniz.')
  }

  if (!isValidDate(myShiftDate) || !isValidDate(swapDate)) {
    throw new Error('Geçerli tarih seçmelisiniz.')
  }

  const requester = await findByUsername(username)
  if (!requester) {
    throw new Error('Talep eden kullanıcı bulunamadı.')
  }

  const counterpart = await findByUsername(counterpartUsername)
  if (!counterpart) {
    throw new Error('Karşı personel bulunamadı.')
  }

  if (!counterpart.department) {
    throw new Error('Karşı personelin departman bilgisi bulunamadı.')
  }

  if (
    requester.department &&
    counterpart.department &&
    requester.department !== counterpart.department
  ) {
    throw new Error('Vardiya değişimi yalnızca aynı birimdeki personeller arasında yapılabilir.')
  }

  return createShiftRequest({
    username,
    counterpartUsername,
    myShiftDate,
    swapDate,
    description: String(description || '').trim(),
  })
}

const getUserShiftRequests = async ({ username }) => {
  if (!username) {
    throw new Error('Kullanıcı adı zorunludur.')
  }

  return getShiftRequestsByUsername(username)
}

const respondPeerShiftRequest = async ({ id, username, approve }) => {
  if (!username) {
    throw new Error('Kullanıcı adı zorunludur.')
  }

  const request = await getShiftRequestById(id)
  if (!request) {
    throw new Error('Vardiya değişim talebi bulunamadı.')
  }

  if (request.counterpart_username !== username) {
    throw new Error('Bu talebi yalnızca karşı personel yanıtlayabilir.')
  }

  if (request.status === STATUS.REJECTED || request.peer_status === 'Reddedildi') {
    throw new Error('Bu talep zaten reddedilmiş.')
  }

  if (request.status === STATUS.APPROVED) {
    throw new Error('Bu talep zaten tamamlanmış.')
  }

  if (request.peer_status === 'Onaylandı' || request.status === STATUS.ADMIN_PENDING) {
    throw new Error('Personel onayı zaten verilmiş. Talep admin onayında.')
  }

  if (request.status !== STATUS.PEER_PENDING && request.peer_status !== 'Bekliyor') {
    throw new Error('Bu talep personel onayı aşamasında değil.')
  }

  if (!approve) {
    return updateShiftRequestFields(id, {
      peer_status: 'Reddedildi',
      admin_status: 'Bekliyor',
      status: STATUS.REJECTED,
    })
  }

  return updateShiftRequestFields(id, {
    peer_status: 'Onaylandı',
    admin_status: 'Bekliyor',
    status: STATUS.ADMIN_PENDING,
  })
}

const finalizeAdminShiftApproval = async (request) => {
  await applyShiftSwapAttendance({
    username: request.username,
    counterpartUsername: request.counterpart_username,
    myShiftDate: request.my_shift_date,
    swapDate: request.swap_date,
  })

  return updateShiftRequestFields(request.id, {
    peer_status: 'Onaylandı',
    admin_status: 'Onaylandı',
    status: STATUS.APPROVED,
    swapped: 1,
  })
}

const approveShiftByAdmin = async ({ id }) => {
  const request = await getShiftRequestById(id)
  if (!request) {
    throw new Error('Vardiya değişim talebi bulunamadı.')
  }

  if (request.status === STATUS.APPROVED) {
    throw new Error('Bu talep zaten onaylanmış.')
  }

  if (request.status === STATUS.REJECTED) {
    throw new Error('Reddedilmiş talep onaylanamaz.')
  }

  if (request.peer_status !== 'Onaylandı' && request.status !== STATUS.ADMIN_PENDING) {
    throw new Error('Önce karşı personelin onaylaması gerekir.')
  }

  return finalizeAdminShiftApproval(request)
}

const rejectShiftByAdmin = async ({ id }) => {
  const request = await getShiftRequestById(id)
  if (!request) {
    throw new Error('Vardiya değişim talebi bulunamadı.')
  }

  if (request.status === STATUS.APPROVED) {
    throw new Error('Tamamlanmış talep reddedilemez.')
  }

  if (request.status === STATUS.REJECTED) {
    throw new Error('Bu talep zaten reddedilmiş.')
  }

  if (request.peer_status !== 'Onaylandı' && request.status !== STATUS.ADMIN_PENDING) {
    throw new Error('Admin reddi için önce personel onayının tamamlanması gerekir.')
  }

  return updateShiftRequestFields(id, {
    admin_status: 'Reddedildi',
    status: STATUS.REJECTED,
  })
}

export {
  STATUS,
  createShiftChange,
  getUserShiftRequests,
  respondPeerShiftRequest,
  approveShiftByAdmin,
  rejectShiftByAdmin,
}
