# Ilirion AI Chatbot

Albanian-exclusive AI assistant built with Next.js and DeepSeek AI.

## Features

- Albanian language chatbot interface
- DeepSeek AI integration
- Next.js application with modern UI
- Real-time streaming responses
- PostgreSQL database for storing chats and messages

## Deployment on Vercel

1. Fork or clone this repository to your GitHub account
2. Connect your GitHub repository to Vercel
3. Configure the following environment variables in Vercel:
   - `DEEPSEEK_API_KEY`: Your DeepSeek API key
   - `NEXTAUTH_URL`: The URL of your deployed app
   - `NEXTAUTH_SECRET`: A secure random string for authentication
   - `POSTGRES_URL`: PostgreSQL connection string (Required for production)

### Setting up a PostgreSQL Database

For production use, we recommend using [Neon](https://neon.tech) or [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres):

1. Create a database using either service
2. Get your connection string in the format: `postgresql://username:password@host:port/database_name`
3. Set it as the `POSTGRES_URL` environment variable in Vercel
4. After deployment, run database migrations with: `npx drizzle-kit push`

## Development

```bash
# Install dependencies
npm install

# Run the development server
npm run dev

# Run database migrations (if using PostgreSQL)
npm run db:migrate
```

## Environment Variables

Create a `.env.local` file with the following variables:

```
# API Keys
DEEPSEEK_API_KEY=your_deepseek_api_key

# Authentication
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_random_secure_string

# Database (required for production)
POSTGRES_URL=postgresql://username:password@host:port/database_name
```

## Technology Stack

- Next.js
- React
- AI SDK
- DeepSeek AI
- NextAuth.js for authentication
- PostgreSQL with Drizzle ORM
