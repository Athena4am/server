import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
});

export default sql;