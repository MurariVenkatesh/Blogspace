import express from 'express';
import mongodb from 'mongodb';
import cors from 'cors';
import nodemailer from 'nodemailer';
import bcrypt from 'bcrypt';
import { connectToDB, db } from './db.js'; // Ensure db.js exports connectToDB and db
import dotenv from "dotenv";
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
dotenv.config(); // Load environment variables

const app = express();

app.use(express.json());

app.use(cors({
    origin: 'http://localhost:3000', // Adjust if your frontend runs on a different port
    credentials: true,
}));
const upload = multer({ dest: 'uploads/' });

app.post('/api/upload-file', upload.single('file'), async (req, res) => {
    const { file } = req;
    const { fileName, type } = req.body;

    if (!file || !fileName || !type) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Upload file to Firebase Storage
        const bucket = storage.bucket();
        const uniqueFileName = `${uuidv4()}_${file.originalname}`;
        const blob = bucket.file(uniqueFileName);
        const blobStream = blob.createWriteStream({
            metadata: {
                contentType: file.mimetype
            }
        });

        blobStream.on('error', (err) => {
            console.error('Upload to Firebase failed:', err);
            res.status(500).json({ error: 'Failed to upload file' });
        });

        blobStream.on('finish', async () => {
            // Get the public URL
            const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(uniqueFileName)}?alt=media`;

            try {
                // Save file information in MongoDB
                await db.collection('files').insertOne({
                    fileName,
                    url: publicUrl,
                    type,
                    like: 0
                });

                res.status(200).json({ message: 'File uploaded successfully', url: publicUrl });
            } catch (error) {
                console.error('Error saving to MongoDB:', error);
                res.status(500).json({ error: 'Failed to save file info to database' });
            }
        });

        blobStream.end(file.buffer);
    } catch (error) {
        console.error('Error processing upload:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

const toggleLike = async (fileId) => {
    try {
        // Validate fileId
        if (!mongodb.ObjectId.isValid(fileId)) {
            throw new Error('Invalid fileId');
        }

        // Fetch the blog document from the database
        const file = await db.collection('files').findOne({ _id: new mongodb.ObjectId(fileId) });
        if (!file) {
            throw new Error('Blog post not found');
        }

        // Toggle like logic
        const newLikesCount = file.likes % 2 === 0 ? file.likes + 1 : file.likes - 1;

        // Update the likes count in the database
        await db.collection('files').updateOne({ _id: new mongodb.ObjectId(fileId) }, { $set: { likes: newLikesCount } });

        // Return the new likes count
        return newLikesCount;
    } catch (error) {
        console.error('Error in toggleLike function:', error);
        throw new Error('Failed to toggle like');
    }
};

app.post('/api/add-comment/:id', async (req, res) => {
    const { id } = req.params;
    const { comment } = req.body;

    // Validate ID and comment
    if (!mongodb.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid file ID' });
    }

    if (typeof comment !== 'string' || !comment.trim()) {
        return res.status(400).json({ error: 'Invalid comment' });
    }

    try {
        const file = await db.collection('files').findOne({ _id: new mongodb.ObjectId(id) });
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Add the new comment to the list
        const updatedComments = [...file.comments || [], comment];
        await db.collection('files').updateOne(
            { _id: new mongodb.ObjectId(id) },
            { $set: { comments: updatedComments } }
        );

        res.json({ success: true, comments: updatedComments });
    } catch (error) {
        console.error('Error in /api/add-comment/:id endpoint:', error);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

// PATCH endpoint to toggle like
app.patch('/api/toggle-like/:id', async (req, res) => {
    const { id } = req.params;

    if (!mongodb.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid blog post ID' });
    }

    try {
        const newLikesCount = await toggleLike(id);
        res.json({ success: true, likes: newLikesCount });
    } catch (error) {
        console.error('Error in /api/toggle-like/:id endpoint:', error);
        res.status(500).json({ error: 'Failed to update likes' });
    }
});


app.get('/api/get-files', async (req, res) => {
    try {
        // Fetch all file records from MongoDB
        const files = await db.collection('files').find({}).toArray();
        res.json({ files });
    } catch (error) {
        console.error('Error fetching files:', error);
        res.status(500).json({ error: 'Failed to fetch files' });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        console.log('Received request for /api/users');
        const users = await db.collection('arjun').find({}).toArray();

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
// app.post('/api/login', async (req, res) => {
//     try {
//         const { email, password } = req.body;
//         const user = await db.collection('users').findOne({ email, password });

//         if (user) {
//             res.status(200).json({ message: 'Login successful', user });
//         } else {
//             res.status(401).json({ error: 'Invalid credentials' });
//         }
//     } catch (error) {
//         console.error('Error during login:', error);
//         res.status(500).json({ error: 'Login failed' });
//     }
// });

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

let storedOtp = null;
let otpEmail = null;
//const otpExpirationTime = 10 * 60 * 1000; // 10 minutes

// Function to generate a random 6-digit OTP
function generateOTP() {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < 6; i++) {
        otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
}

// Endpoint to generate and send OTP
app.post('/generate-otp', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    const generatedOTP = generateOTP();
    storedOtp = generatedOTP;
    otpEmail = email;
    //const otpExpiration = Date.now() + otpExpirationTime;

    try {
        await sendOTPEmail(email, generatedOTP);
        res.json({ message: 'OTP generated and sent successfully' });
    } catch (error) {
        console.error('Error sending OTP email:', error.message);
        res.status(500).json({ error: 'Failed to send OTP email', details: error.message });
    }
});
app.post('/api/login-google', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        // Check if the user exists
        const user = await db.collection('users').findOne({ email });

        if (user) {
            res.json({ message: 'User signed in successfully' });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Error during Google Sign-In:', error);
        res.status(500).json({ error: 'Failed to sign in', details: error.message });
    }
});
app.post('/api/register-google-user', async (req, res) => {
    const { email, username } = req.body;

    if (!email || !username) {
        return res.status(400).json({ error: 'Email and username are required' });
    }

    try {
        // Check if the user already exists
        const existingUser = await db.collection('users').findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Insert user details into the database
        await db.collection('users').insertOne({
            email,
            username,
        });

        res.json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Error registering Google user:', error);
        res.status(500).json({ error: 'Failed to register user', details: error.message });
    }
});


// Endpoint to verify OTP and register user
app.post('/verify-otp', async (req, res) => {
    const { userotp, username, password } = req.body;

    if (!userotp || !username || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        if (storedOtp !== userotp ) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        storedOtp = null;
       

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.collection('users').insertOne({
            email: otpEmail,
            username,
            password: hashedPassword,
        });

        res.json({ message: 'OTP verified and user registered successfully' });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ error: 'Failed to verify OTP', details: error.message });
    }
});

// User login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await db.collection('users').findOne({ email });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        res.status(200).json({ message: 'Login successful', user });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Function to send OTP via email using Nodemailer
async function sendOTPEmail(email, otp) {
    // Configure Nodemailer with your email service provider settings
    let transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com', // SMTP server hostname for Gmail
        port: 587, // Port for TLS
        secure: false, // false for TLS
        auth: {
            user: process.env.EMAIL_USER, // Replace with your Gmail address or environment variable
            pass: process.env.EMAIL_PASS, // Replace with your app-specific password or environment variable
        },
    });

    // Email content
    let mailOptions = {
        from: '"BlogSpace" <${process.env.EMAIL_USER}>',
        to: email,
        subject: 'OTP for Verification',
        text: `Your OTP for verification is: ${otp}`, // Use backticks for template literal
    };

    // Send email
    try {
        await transporter.sendMail(mailOptions);
        console.log('OTP email sent successfully');
    } catch (error) {
        console.error('Error sending OTP email:', error);
        throw new Error('Failed to send OTP email');
    }
}

// Root endpoint to check server status
app.get('/', (req, res) => {
    res.send("Server is running!");
});

// Start the server on port 8000
connectToDB(() => {
    app.listen(8000, () => {
        console.log("Server Running At port 8000");
    });
});
