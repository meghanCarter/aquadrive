import {createApp} from './app.mjs';
import express from 'express';
import {existsSync} from 'node:fs';
const production=process.env.NODE_ENV==='production';
if(production&&(!process.env.PUBLIC_URL?.startsWith('https://')||!process.env.ALLOWED_ORIGINS||!process.env.DB_PATH))throw Error('Production requires HTTPS PUBLIC_URL, ALLOWED_ORIGINS and persistent DB_PATH.');
const {app,db}=createApp();
if(existsSync('./public/index.html')){app.use(express.static('./public'));app.get('/{*path}',(_req,res)=>res.sendFile(new URL('./public/index.html',import.meta.url).pathname));}
const server=app.listen(Number(process.env.PORT||4000),'0.0.0.0',()=>console.log(`AQUADRIVE API listening on port ${process.env.PORT||4000}`));
const close=()=>server.close(()=>{db.close();process.exit(0)});process.on('SIGTERM',close);process.on('SIGINT',close);
