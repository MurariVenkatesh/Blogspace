import express from 'express';
import cors from 'cors';
// import { MongoClient, ObjectId } from 'mongodb';
import nodemailer from 'nodemailer';
import { connectToDB, db } from './db.js';
const app = express();

app.use(express.json());

app.use(cors({
    origin: 'http://localhost:3000', // Your frontend origin
    credentials: true,
}));

app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});
 // Replace with your database name

// User creation or update endpoint
app.get('/api/users', async (req, res) => {
    try {
        // Log incoming request for debugging
        console.log('Received request for /api/users');
        
        // Fetch all users from the 'arjun' collection
        const users = await db.collection('arjun').find({}).toArray();
        
        // Log the result for debugging
        // console.log('Users fetched:', users);

        if (users.length === 0) {
            return res.status(404).json({ message: 'No users found' });
        }

        res.status(200).json(users);
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



// User login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await db.collection('users').findOne({ email, password });
        if (user) {
            res.status(200).json({ message: 'Login successful', user });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Message sending endpoint
app.post('/api/messages', async (req, res) => {
    try {
        const { from, to, text } = req.body;
        const message = { from, to, text, timestamp: new Date() };
        await db.collection('messages').insertOne(message);
        res.status(201).json(message);
    } catch (error) {
        res.status(500).json({ message: 'Error sending message' });
    }
});

// Get messages between two users
app.get('/api/messages/:userId/:chatUserId', async (req, res) => {
    try {
        const { userId, chatUserId } = req.params;
        const messages = await db.collection('messages').find({
            $or: [
                { from: userId, to: chatUserId },
                { from: chatUserId, to: userId }
            ]
        }).sort({ timestamp: 1 }).toArray();
        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving messages' });
    }
});

// OTP generation endpoint
app.post('/generate-otp', async (req, res) => {
    const { email } = req.body;
    const generatedOTP = generateOTP();

    try {
        await db.collection('users').updateOne({ email }, { $set: { otp: generatedOTP } }, { upsert: true });
        await sendOTPEmail(email, generatedOTP);
        res.json({ message: "OTP generated and sent successfully" });
    } catch (error) {
        console.error('Error sending OTP email:', error.message);
        res.status(500).json({ error: 'Failed to send OTP email', details: error.message });
    }
});

// OTP verification endpoint
app.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;

    try {
        const user = await db.collection('users').findOne({ email });
        if (user && user.otp === otp) {
            res.json({ message: "OTP verification successful" });
        } else {
            res.status(400).json({ error: "Invalid OTP" });
        }
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ error: 'Failed to verify OTP' });
    }
});

// Function to generate a random 6-digit OTP
function generateOTP() {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < 6; i++) {
        otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
}

// Function to send OTP via email using Nodemailer
async function sendOTPEmail(email, otp) {
    let transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: 'your-email@gmail.com',
            pass: 'your-app-specific-password' // Use app-specific password for Gmail
        }
    });

    let mailOptions = {
        from: '"Your App" <your-email@gmail.com>',
        to: email,
        subject: 'OTP for Verification',
        text: `Your OTP for verification is: ${otp}`
    };

    await transporter.sendMail(mailOptions);
}

// Root endpoint to check server status
app.get('/', (req, res) => {
    res.send("Server is running!");
});

// Start the server on port 8000
connectToDB(()=>{
    app.listen(8000,()=>{
        console.log("Server Running At port 8000");
    })
})