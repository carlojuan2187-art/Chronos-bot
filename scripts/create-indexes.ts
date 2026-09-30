import { connectDatabase,disconnectDatabase } from '../src/config/database.js'
import mongoose from 'mongoose'
await connectDatabase();for(const model of Object.values(mongoose.models)){await model.syncIndexes();console.log(`Indexes synced: ${model.modelName}`)}await disconnectDatabase()
