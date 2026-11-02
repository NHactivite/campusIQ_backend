import mongoose from "mongoose";

export const connectDB=(uri:string)=>{
        mongoose.connect(uri,{
            dbName:"IICSibsagar",
        }).then(c=>console.log(`database connected ${c.connection.host}`)).catch(e=>console.log(e));
       
};