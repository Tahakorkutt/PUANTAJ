import {
  createShiftChange,
  getUserShiftRequests,
  respondPeerShiftRequest,
} from '../service/shiftService.js'

const createShiftHandler = async (req, res) => {
  try {
    const { username, counterpartUsername, myShiftDate, swapDate, description } = req.body
    const result = await createShiftChange({
      username,
      counterpartUsername,
      myShiftDate,
      swapDate,
      description,
    })

    return res.status(201).json({
      success: true,
      message:
        'Vardiya değişim talebi oluşturuldu. Önce karşı personelin, ardından admin onayına gidecek.',
      data: result,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

const getShiftHistoryHandler = async (req, res) => {
  try {
    const { username } = req.params
    const requests = await getUserShiftRequests({ username })

    return res.status(200).json({
      success: true,
      data: requests,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

const peerApproveShiftHandler = async (req, res) => {
  try {
    const { id } = req.params
    const { username } = req.body
    const result = await respondPeerShiftRequest({
      id: Number(id),
      username,
      approve: true,
    })

    return res.status(200).json({
      success: true,
      message: 'Personel onayı verildi. Talep admin onayına iletildi.',
      data: result,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

const peerRejectShiftHandler = async (req, res) => {
  try {
    const { id } = req.params
    const { username } = req.body
    const result = await respondPeerShiftRequest({
      id: Number(id),
      username,
      approve: false,
    })

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

export {
  createShiftHandler,
  getShiftHistoryHandler,
  peerApproveShiftHandler,
  peerRejectShiftHandler,
}
