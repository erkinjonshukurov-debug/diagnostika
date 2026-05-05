const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'diagnostika.db'));

// Jadval yaratish
db.run(`
  CREATE TABLE IF NOT EXISTS avtomobillar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sana TEXT NOT NULL,
    raqam TEXT NOT NULL UNIQUE,
    turi TEXT NOT NULL,
    diagnostika TEXT NOT NULL,
    narxi INTEGER NOT NULL,
    admin_id INTEGER NOT NULL,
    admin_name TEXT NOT NULL
  )
`);

// Ma'lumot qo'shish
function addCar(carNumber, carType, isDiagnosed, adminId, adminName) {
  const sana = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
  const diagnostika = isDiagnosed ? "o‘tkazildi" : "o‘tkazilmadi";
  const narxi = isDiagnosed ? 250000 : 0;
  
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO avtomobillar (sana, raqam, turi, diagnostika, narxi, admin_id, admin_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sana, carNumber.toUpperCase(), carType, diagnostika, narxi, adminId, adminName],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

// Avtomobilni tekshirish
function checkCar(carNumber) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM avtomobillar WHERE raqam = ?`,
      [carNumber.toUpperCase()],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

// Jami summa
function getTotalSum() {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT SUM(narxi) as total, COUNT(*) as count FROM avtomobillar WHERE diagnostika = 'o‘tkazildi'`,
      (err, row) => {
        if (err) reject(err);
        else resolve({ total: row.total || 0, count: row.count || 0 });
      }
    );
  });
}

// So'nggi yozuvlar
function getLastRecords(limit = 10) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM avtomobillar ORDER BY id DESC LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

// Barcha avtomobillar
function getAllCars() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM avtomobillar ORDER BY id DESC`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = { addCar, checkCar, getTotalSum, getLastRecords, getAllCars };
