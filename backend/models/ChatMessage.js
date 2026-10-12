import db from '../config/database.js'

const normalizeDepartmentKey = (department) =>
  String(department || 'genel')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'genel'

const normalizeConversationKey = (userA, userB) => {
  const first = String(userA || '').trim()
  const second = String(userB || '').trim()

  if (!first || !second) {
    return ''
  }

  const [left, right] = [first, second].sort((a, b) => a.localeCompare(b, 'tr-TR'))
  return `${left}::${right}`
}

const createDepartmentChatTable = () => {
  return new Promise((resolve, reject) => {
    db.run(
      `
        CREATE TABLE IF NOT EXISTS department_chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          department TEXT NOT NULL,
          department_key TEXT NOT NULL,
          sender TEXT NOT NULL,
          text TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      (err) => {
        if (err) {
          reject(err)
          return
        }

        db.all('PRAGMA table_info(department_chat_messages)', (pragmaErr, columns) => {
          if (pragmaErr) {
            reject(pragmaErr)
            return
          }

          const migrations = []

          if (!columns.some((column) => column.name === 'department_key')) {
            migrations.push(
              'ALTER TABLE department_chat_messages ADD COLUMN department_key TEXT NOT NULL DEFAULT ""',
            )
          }

          const runMigration = (index) => {
            if (index >= migrations.length) {
              resolve()
              return
            }

            db.run(migrations[index], (alterErr) => {
              if (alterErr) {
                reject(alterErr)
                return
              }

              runMigration(index + 1)
            })
          }

          runMigration(0)
        })
      },
    )
  })
}

const createDirectChatTable = () => {
  return new Promise((resolve, reject) => {
    db.run(
      `
        CREATE TABLE IF NOT EXISTS direct_chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender TEXT NOT NULL,
          receiver TEXT NOT NULL,
          conversation_key TEXT NOT NULL,
          text TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      (err) => {
        if (err) {
          reject(err)
          return
        }

        db.all('PRAGMA table_info(direct_chat_messages)', (pragmaErr, columns) => {
          if (pragmaErr) {
            reject(pragmaErr)
            return
          }

          const migrations = []

          if (!columns.some((column) => column.name === 'conversation_key')) {
            migrations.push(
              'ALTER TABLE direct_chat_messages ADD COLUMN conversation_key TEXT NOT NULL DEFAULT ""',
            )
          }

          const runMigration = (index) => {
            if (index >= migrations.length) {
              resolve()
              return
            }

            db.run(migrations[index], (alterErr) => {
              if (alterErr) {
                reject(alterErr)
                return
              }

              runMigration(index + 1)
            })
          }

          runMigration(0)
        })
      },
    )
  })
}

const getDepartmentMessages = async (department) => {
  const normalizedDepartment = normalizeDepartmentKey(department)

  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT id, department, department_key, sender, text, created_at
        FROM department_chat_messages
        WHERE department_key = ?
        ORDER BY id ASC
      `,
      [normalizedDepartment],
      (err, rows) => {
        if (err) {
          reject(err)
          return
        }

        resolve((rows || []).map((row) => ({
          id: row.id,
          sender: row.sender,
          text: row.text,
          time: row.created_at ? new Date(row.created_at).toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit',
          }) : '--:--',
          created_at: row.created_at,
          department: row.department,
        })))
      },
    )
  })
}

const getConversationMessages = async ({ userA, userB }) => {
  const conversationKey = normalizeConversationKey(userA, userB)

  if (!conversationKey) {
    return []
  }

  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT id, sender, receiver, conversation_key, text, created_at
        FROM direct_chat_messages
        WHERE conversation_key = ?
        ORDER BY id ASC
      `,
      [conversationKey],
      (err, rows) => {
        if (err) {
          reject(err)
          return
        }

        resolve((rows || []).map((row) => ({
          id: row.id,
          sender: row.sender,
          receiver: row.receiver,
          text: row.text,
          time: row.created_at ? new Date(row.created_at).toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit',
          }) : '--:--',
          created_at: row.created_at,
          conversation_key: row.conversation_key,
        })))
      },
    )
  })
}

const createDepartmentMessage = async ({ department, sender, text }) => {
  const trimmedDepartment = String(department || '').trim()
  const trimmedSender = String(sender || '').trim()
  const trimmedText = String(text || '').trim()

  if (!trimmedDepartment || !trimmedSender || !trimmedText) {
    throw new Error('Departman, gönderici ve mesaj alanları zorunludur.')
  }

  const normalizedKey = normalizeDepartmentKey(trimmedDepartment)

  return new Promise((resolve, reject) => {
    db.run(
      `
        INSERT INTO department_chat_messages (department, department_key, sender, text)
        VALUES (?, ?, ?, ?)
      `,
      [trimmedDepartment, normalizedKey, trimmedSender, trimmedText],
      function (err) {
        if (err) {
          reject(err)
          return
        }

        const savedMessage = {
          id: this.lastID,
          department: trimmedDepartment,
          department_key: normalizedKey,
          sender: trimmedSender,
          text: trimmedText,
          created_at: new Date().toISOString(),
        }

        resolve({
          ...savedMessage,
          time: new Date(savedMessage.created_at).toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        })
      },
    )
  })
}

const createDirectMessage = async ({ sender, receiver, text }) => {
  const trimmedSender = String(sender || '').trim()
  const trimmedReceiver = String(receiver || '').trim()
  const trimmedText = String(text || '').trim()

  if (!trimmedSender || !trimmedReceiver || !trimmedText) {
    throw new Error('Gönderen, alıcı ve mesaj alanları zorunludur.')
  }

  const conversationKey = normalizeConversationKey(trimmedSender, trimmedReceiver)

  if (!conversationKey) {
    throw new Error('Mesaj için konuşma anahtarı oluşturulamadı.')
  }

  return new Promise((resolve, reject) => {
    db.run(
      `
        INSERT INTO direct_chat_messages (sender, receiver, conversation_key, text)
        VALUES (?, ?, ?, ?)
      `,
      [trimmedSender, trimmedReceiver, conversationKey, trimmedText],
      function (err) {
        if (err) {
          reject(err)
          return
        }

        const savedMessage = {
          id: this.lastID,
          sender: trimmedSender,
          receiver: trimmedReceiver,
          conversation_key: conversationKey,
          text: trimmedText,
          created_at: new Date().toISOString(),
        }

        resolve({
          ...savedMessage,
          time: new Date(savedMessage.created_at).toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        })
      },
    )
  })
}

export {
  createDepartmentChatTable,
  createDirectChatTable,
  getDepartmentMessages,
  getConversationMessages,
  createDepartmentMessage,
  createDirectMessage,
  normalizeConversationKey,
}
