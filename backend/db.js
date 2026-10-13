require('dotenv').config();
const mongoose = require('mongoose');

let cached = null;

async function connect() {
  if (cached) return cached;
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  mongoose.set('strictQuery', true);
  cached = await mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: 10,          // M0 allows ~500 connections total, keep this small
    serverSelectionTimeoutMS: 8000,
  });
  return cached;
}

module.exports = { connect, mongoose };
