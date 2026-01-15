import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  jwtSecret: process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production",
  jwtExpiresIn: "30d",
  domain: process.env.DOMAIN || "localhost",
  origin: process.env.ORIGIN || "http://localhost:3000",
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/evm-auth",
} as const;
