import { configured,tokens } from '../_lib/google.js';
export default function handler(req,res){res.status(200).json({connected:Boolean(tokens(req)),configured:configured()})}
