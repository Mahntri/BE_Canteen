import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import router from './src/router/index.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}));

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

app.use('/api/v1', router);

app.get('/', (req, res) => {
  res.json({ 
    message: 'Server Canteen is running...', 
    status: 'OK' 
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'API Not Found' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;