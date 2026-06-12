import { RouteParser } from '../types.js';
import { expressParser } from './express.js';
import { fastapiParser } from './fastapi.js';
import { flaskParser } from './flask.js';
import { djangoParser } from './django.js';
import { honoParser } from './hono.js';
import { ginParser } from './gin.js';

export const parsers: Record<string, RouteParser> = {
  'Express.js': expressParser,
  'FastAPI': fastapiParser,
  'Flask': flaskParser,
  'Django': djangoParser,
  'Hono': honoParser,
  'Gin': ginParser,
};
