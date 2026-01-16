import dotenv from 'dotenv';
import connectDB from "./db/index.js";
import { app } from './app.js';

dotenv.config({
    path: './env'
})
connectDB()
.then(() =>{
    app.on("error",(error) =>{
        console.log(error);
        throw error
    })
app.listen(process.env.PORT || 5500, () =>{
    console.log(`Server is running at port ${process.env.PORT || 5500}`)
})
})
.catch((error) =>{
    console.log("MONGODB Connection Failed !!!",error)
})