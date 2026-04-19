import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.connect((err) => {
  if (err) console.error('Lỗi kết nối Database:', err.stack);
  else console.log('Đã kết nối PostgreSQL thành công!');
});

export default {
  query: (text, params) => pool.query(text, params),
};