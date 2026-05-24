import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './index.js';

describe('Express API Tests', () => {
  describe('GET /', () => {
    it('should return 200 OK and welcome message', async () => {
      const response = await request(app).get('/');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'welcome to LLM_ENGINEERING WITH NODEJS',
      });
    });
  });

  describe('GET /health', () => {
    it('should return 200 OK and status ok', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('POST /echo', () => {
    it('should return 200 OK and echoed message for valid input', async () => {
      const payload = { message: 'Hello, Antigravity!' };
      const response = await request(app)
        .post('/echo')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'success',
        echoed: 'Hello, Antigravity!',
      });
    });

    it('should return 400 Bad Request for invalid input (empty message)', async () => {
      const payload = { message: '' };
      const response = await request(app)
        .post('/echo')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message', 'Validation failed');
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'message',
          }),
        ])
      );
    });

    it('should return 400 Bad Request for missing message field', async () => {
      const payload = {};
      const response = await request(app)
        .post('/echo')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'message',
            message: 'Message is required and cannot be empty',
          }),
        ])
      );
    });
  });
});
