# Ilirion AI Chatbot

Albanian-exclusive AI assistant built with Next.js and DeepSeek AI.

## Features

- Albanian language chatbot interface
- DeepSeek AI integration
- Next.js application with modern UI
- Real-time streaming responses

## Deployment on Vercel

1. Fork or clone this repository to your GitHub account
2. Connect your GitHub repository to Vercel
3. Configure the following environment variables in Vercel:
   - `DEEPSEEK_API_KEY`: Your DeepSeek API key
   - `NEXTAUTH_URL`: The URL of your deployed app
   - `NEXTAUTH_SECRET`: A secure random string for authentication
   - `DATABASE_URL`: (Optional) PostgreSQL connection string if using a database

## Development

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
```

## Environment Variables

Create a `.env.local` file with the following variables:

```
DEEPSEEK_API_KEY=your_deepseek_api_key
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_random_secure_string
```

## Technology Stack

- Next.js
- React
- AI SDK
- DeepSeek AI
- NextAuth.js for authentication
