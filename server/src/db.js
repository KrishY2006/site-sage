const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    // This line reaches out to MongoDB using the secret string in your .env file
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Atlas connected successfully!');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;