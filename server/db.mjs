import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
export function openDb(path) {
 if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
 const db=new DatabaseSync(path);db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,phone TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('customer','supplier','admin')),disabled INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS suppliers(id TEXT PRIMARY KEY REFERENCES users(id),profile TEXT NOT NULL,approved INTEGER NOT NULL DEFAULT 0,approval_expires INTEGER NOT NULL DEFAULT 0,available INTEGER NOT NULL DEFAULT 0,stock INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,mime TEXT NOT NULL,bytes BLOB NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES users(id),supplier_id TEXT NOT NULL REFERENCES suppliers(id),idempotency_key TEXT NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,UNIQUE(customer_id,idempotency_key));
 CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),actor_id TEXT NOT NULL REFERENCES users(id),action TEXT NOT NULL,at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS payment_attempts(order_id TEXT PRIMARY KEY REFERENCES orders(id),reference TEXT NOT NULL UNIQUE,state TEXT NOT NULL,poll_url TEXT,instructions TEXT,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS document_tickets(hash TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES documents(id),user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS drivers(user_id TEXT PRIMARY KEY REFERENCES users(id),company_id TEXT NOT NULL REFERENCES suppliers(id));
 CREATE TABLE IF NOT EXISTS driver_invites(hash TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES suppliers(id),expires_at INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS vehicles(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES suppliers(id),description TEXT NOT NULL,registration TEXT NOT NULL UNIQUE);
 `);return db;
}
export function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}
