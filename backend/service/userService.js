import bcrypt from 'bcryptjs'
import {
  createUser,
  findByUsername,
  findRegisteredUsersWithDepartment,
} from '../models/User.js'

const activeSessions = new Map()

const registerUser = async ({ username, fullName, department, password }) => {
  if (!username || !fullName || !department || !password) {
    throw new Error('Kullanıcı adı, ad soyad, departman ve şifre zorunludur.')
  }

  const existingUser = await findByUsername(username)
  if (existingUser) {
    throw new Error('Bu kullanıcı adı zaten kullanılmaktadır.')
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await createUser({
    username,
    fullName,
    department,
    passwordHash,
  })

  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    department: user.department,
  }
}

const loginUser = async ({ username, password }) => {
  if (!username || !password) {
    throw new Error('Kullanıcı adı ve şifre zorunludur.')
  }

  const user = await findByUsername(username)
  if (!user) {
    throw new Error('Kullanıcı bulunamadı.')
  }

  const isPasswordValid = await bcrypt.compare(password, user.password)
  if (!isPasswordValid) {
    throw new Error('Şifre hatalı.')
  }

  activeSessions.set(user.username, {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    department: user.department || '',
    role: user.role || 'user',
  })

  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    department: user.department || '',
    role: user.role || 'user',
  }
}

const logoutUser = async ({ username }) => {
  if (!username) {
    throw new Error('Çıkış için kullanıcı adı zorunludur.')
  }

  activeSessions.delete(username)

  return {
    success: true,
    message: 'Çıkış yapıldı.',
    username,
  }
}

const getDepartmentColleagues = async ({ username }) => {
  if (!username) {
    throw new Error('Kullanıcı adı zorunludur.')
  }

  const user = await findByUsername(username)
  if (!user) {
    throw new Error('Kullanıcı bulunamadı.')
  }

  if (!user.department || !String(user.department).trim()) {
    return []
  }

  const colleagues = await findRegisteredUsersWithDepartment(
    username,
    String(user.department).trim(),
  )

  return colleagues.map((colleague) => ({
    id: colleague.id,
    username: colleague.username,
    full_name: colleague.full_name,
    department: colleague.department,
  }))
}

export { registerUser, loginUser, logoutUser, getDepartmentColleagues, activeSessions }
