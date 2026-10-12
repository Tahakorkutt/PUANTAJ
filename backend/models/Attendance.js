import db from '../config/database.js'

const createAttendanceTable = () => {
  return new Promise((resolve, reject) => {
    db.run(
      `
        CREATE TABLE IF NOT EXISTS attendance_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL,
          action TEXT NOT NULL CHECK(action IN ('checkin', 'checkout')),
          source TEXT DEFAULT 'camera',
          note TEXT DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      (err) => {
        if (err) {
          reject(err)
          return
        }

        resolve()
      },
    )
  })
}

const createAttendanceLog = ({ username, action, source = 'camera', note = '' }) => {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString()

    db.run(
      'INSERT INTO attendance_logs (username, action, source, note, created_at) VALUES (?, ?, ?, ?, ?)',
      [username, action, source, note, createdAt],
      function (err) {
        if (err) {
          reject(err)
          return
        }

        resolve({
          id: this.lastID,
          username,
          action,
          source,
          note,
          created_at: createdAt,
        })
      },
    )
  })
}

const hasAttendanceActionToday = (username, action) => {
  return new Promise((resolve, reject) => {
    // Türkiye saatine göre gün (UTC+3, yaz/kış farkı yok)
    db.get(
      `
        SELECT id
        FROM attendance_logs
        WHERE username = ?
          AND action = ?
          AND date(created_at, '+3 hours') = date('now', '+3 hours')
        LIMIT 1
      `,
      [username, action],
      (err, row) => {
        if (err) {
          reject(err)
          return
        }

        resolve(Boolean(row))
      },
    )
  })
}

const getAttendanceByUsername = (username, { month, year, limit = 500 } = {}) => {
  return new Promise((resolve, reject) => {
    let query = 'SELECT * FROM attendance_logs WHERE username = ?'
    const params = [username]

    if (month && year) {
      query += " AND strftime('%m', created_at) = ? AND strftime('%Y', created_at) = ?"
      params.push(String(month).padStart(2, '0'), String(year))
    }

    query += ' ORDER BY created_at DESC LIMIT ?'
    params.push(limit)

    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err)
        return
      }

      resolve(rows)
    })
  })
}

const getAllAttendanceLogs = (limit = 2000) => {
  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT
          a.*,
          u.full_name,
          u.department
        FROM attendance_logs a
        LEFT JOIN users u ON u.username = a.username
        ORDER BY a.created_at DESC
        LIMIT ?
      `,
      [limit],
      (err, rows) => {
        if (err) {
          reject(err)
          return
        }

        resolve(rows || [])
      },
    )
  })
}

const countTodayCheckins = () => {
  return new Promise((resolve, reject) => {
    db.get(
      `
        SELECT COUNT(DISTINCT username) AS total
        FROM attendance_logs
        WHERE action = 'checkin'
          AND date(created_at) = date('now', 'localtime')
      `,
      (err, row) => {
        if (err) {
          reject(err)
          return
        }

        resolve(row?.total || 0)
      },
    )
  })
}

const countTodayCheckinsByDepartment = (department) => {
  return new Promise((resolve, reject) => {
    db.get(
      `
        SELECT COUNT(DISTINCT a.username) AS total
        FROM attendance_logs a
        INNER JOIN users u ON u.username = a.username
        WHERE a.action = 'checkin'
          AND date(a.created_at) = date('now', 'localtime')
          AND u.department = ?
      `,
      [department],
      (err, row) => {
        if (err) {
          reject(err)
          return
        }

        resolve(row?.total || 0)
      },
    )
  })
}

const getAttendanceLogsByDepartment = (department, limit = 2000) => {
  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT
          a.*,
          u.full_name,
          u.department
        FROM attendance_logs a
        INNER JOIN users u ON u.username = a.username
        WHERE u.department = ?
        ORDER BY a.created_at DESC
        LIMIT ?
      `,
      [department, limit],
      (err, rows) => {
        if (err) {
          reject(err)
          return
        }

        resolve(rows || [])
      },
    )
  })
}

export {
  createAttendanceTable,
  createAttendanceLog,
  hasAttendanceActionToday,
  getAttendanceByUsername,
  getAllAttendanceLogs,
  countTodayCheckins,
  countTodayCheckinsByDepartment,
  getAttendanceLogsByDepartment,
}
