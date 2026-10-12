import db from '../config/database.js'

const createLeaveTable = () => {
  return new Promise((resolve, reject) => {
    db.run(
      `
        CREATE TABLE IF NOT EXISTS leave_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL,
          leave_type TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          description TEXT DEFAULT '',
          status TEXT NOT NULL DEFAULT 'İnceleniyor'
            CHECK(status IN ('İnceleniyor', 'Onaylandı', 'Reddedildi')),
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

const createLeaveRequest = ({ username, leaveType, startDate, endDate, description = '' }) => {
  return new Promise((resolve, reject) => {
    db.run(
      `
        INSERT INTO leave_requests (username, leave_type, start_date, end_date, description, status)
        VALUES (?, ?, ?, ?, ?, 'İnceleniyor')
      `,
      [username, leaveType, startDate, endDate, description],
      function (err) {
        if (err) {
          reject(err)
          return
        }

        resolve({
          id: this.lastID,
          username,
          leave_type: leaveType,
          start_date: startDate,
          end_date: endDate,
          description,
          status: 'İnceleniyor',
          created_at: new Date().toISOString(),
        })
      },
    )
  })
}

const getLeaveRequestsByUsername = (username) => {
  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT * FROM leave_requests
        WHERE username = ?
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [username],
      (err, rows) => {
        if (err) {
          reject(err)
          return
        }

        resolve(rows)
      },
    )
  })
}

const getAllLeaveRequests = () => {
  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT
          l.*,
          u.full_name,
          u.department
        FROM leave_requests l
        LEFT JOIN users u ON u.username = l.username
        ORDER BY l.created_at DESC
        LIMIT 100
      `,
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

const getLeaveRequestsByDepartment = (department) => {
  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT
          l.*,
          u.full_name,
          u.department
        FROM leave_requests l
        INNER JOIN users u ON u.username = l.username
        WHERE u.department = ?
        ORDER BY l.created_at DESC
        LIMIT 100
      `,
      [department],
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

const getLeaveRequestById = (id) => {
  return new Promise((resolve, reject) => {
    db.get(
      `
        SELECT
          l.*,
          u.full_name,
          u.department
        FROM leave_requests l
        LEFT JOIN users u ON u.username = l.username
        WHERE l.id = ?
      `,
      [id],
      (err, row) => {
        if (err) {
          reject(err)
          return
        }

        resolve(row || null)
      },
    )
  })
}

const countOnLeaveToday = () => {
  return new Promise((resolve, reject) => {
    db.get(
      `
        SELECT COUNT(DISTINCT username) AS total
        FROM leave_requests
        WHERE status = 'Onaylandı'
          AND date('now', 'localtime') BETWEEN start_date AND end_date
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

const countOnLeaveTodayByDepartment = (department) => {
  return new Promise((resolve, reject) => {
    db.get(
      `
        SELECT COUNT(DISTINCT l.username) AS total
        FROM leave_requests l
        INNER JOIN users u ON u.username = l.username
        WHERE l.status = 'Onaylandı'
          AND date('now', 'localtime') BETWEEN l.start_date AND l.end_date
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

const updateLeaveRequestStatus = (id, status) => {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE leave_requests SET status = ? WHERE id = ?`,
      [status, id],
      function (err) {
        if (err) {
          reject(err)
          return
        }

        if (this.changes === 0) {
          reject(new Error('İzin talebi bulunamadı.'))
          return
        }

        resolve({ id, status })
      },
    )
  })
}

export {
  createLeaveTable,
  createLeaveRequest,
  getLeaveRequestsByUsername,
  getAllLeaveRequests,
  getLeaveRequestsByDepartment,
  getLeaveRequestById,
  countOnLeaveToday,
  countOnLeaveTodayByDepartment,
  updateLeaveRequestStatus,
}
