const { query } = require('../db');

const PRODUCT_COLS = `
  p.id, p.title, p.description, p.price, p.category,
  p.imageurl AS "imageUrl", p.sellerid AS "sellerId",
  p.stock, p.createdat AS "createdAt", u.email AS "sellerEmail",
   (SELECT COALESCE(AVG(r.rating),0)::float
    FROM "Review" r WHERE r.productid=p.id) AS "averageRating",
   (SELECT COUNT(*)::int
    FROM "Review" r where r.productid = p.id) AS "reviewCount"
`;

async function ensureProductTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS "Product" (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      price DOUBLE PRECISION NOT NULL,
      category TEXT NOT NULL,
      imageurl TEXT,
      sellerid INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      createdat TIMESTAMP DEFAULT NOW()
    )
  `);
}

async function ensureStockColumn() {
  await ensureProductTable();
  await query(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 1`);
}

async function getAll() {
  await ensureStockColumn();
  const result = await query(
    `SELECT ${PRODUCT_COLS} FROM "Product" p LEFT JOIN "User" u ON p.sellerid = u.id ORDER BY p.createdat DESC`
  );
  return result.rows;
}

async function getById(id) {
  await ensureStockColumn();
  const result = await query(
    `SELECT ${PRODUCT_COLS} FROM "Product" p LEFT JOIN "User" u ON p.sellerid = u.id WHERE p.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function getBySellerId(sellerId) {
  await ensureStockColumn();
  const result = await query(
    `SELECT ${PRODUCT_COLS} FROM "Product" p LEFT JOIN "User" u ON p.sellerid = u.id WHERE p.sellerid = $1 ORDER BY p.createdat DESC`,
    [sellerId]
  );
  return result.rows;
}

async function create({ title, description, price, category, imageUrl, sellerId, stock }) {
  await ensureStockColumn();
  const result = await query(
    `INSERT INTO "Product" (title, description, price, category, imageurl, sellerid, stock)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, title, description, price, category, imageurl AS "imageUrl", sellerid AS "sellerId", stock, createdat AS "createdAt"`,
    [title, description, price, category, imageUrl || null, sellerId, stock ?? 1]
  );
  return result.rows[0];
}

async function update(id, sellerId, { title, description, price, category, imageUrl, stock }) {
  await ensureStockColumn();
  const result = await query(
    `UPDATE "Product" SET title = $2, description = $3, price = $4, category = $5, imageurl = $6, stock = $7
     WHERE id = $1 AND sellerid = $8
     RETURNING id, title, description, price, category, imageurl AS "imageUrl", sellerid AS "sellerId", stock, createdat AS "createdAt"`,
    [id, title, description, price, category, imageUrl ?? null, stock ?? 1, sellerId]
  );
  return result.rows[0] || null;
}

async function remove(id, sellerId) {
  const result = await query(
    'DELETE FROM "Product" WHERE id = $1 AND sellerid = $2 RETURNING id',
    [id, sellerId]
  );
  return result.rows[0] || null;
}

async function canReview(productId,buyerId) {
  const result = await query(
    `SELECT EXISTS(
      SELECT 1
      FROM "User" u
      WHERE u.id = $2
        AND u.role = 'buyer'
        AND (EXISTS(SELECT 1 FROM "Order" o WHERE o.productid = $1 AND o.buyerid = $2 AND o.status = 'delivered)
        OR EXISTS (SELECT 1 FROM "Review" r WHERE r.productid = $1 AND r.buyerid = $2)
        )
    ) AS allowed`,
     [productId,buyerId]
  );
  return result.rows[0].allowed;
}

async function getReviews(productId,buyerId,requestedPage = 1){
  const limit = 5;
  const [countResult,averageResult,myReviewResult,eligible] = 
    await Promise.all([
      query(`SELECT COUNT(*) AS total FROM "Review" WHERE productid = $1`,[productId]),
      query(`SELECT COALESCE(AVG(rating), 0) AS average FROM "Review" WHERE productid = $1`,[productId]),
      buyerId ? query(`SELECT id, rating, comment, createdat AS "createdAt" FROM "Review" WHERE productid = $1 AND buyerid = $2`,[productId,buyerId]
      ):Promise.resolve({rows:[]}),
      buyerId ? canReview(productId,buyerId) : Promise.resolve(false),
    ]);

    const reviewCount = countResult.rows[0].total;
    const pages = Math.max(1,Math.ceil(reviewCount/limit));
    const page = Math.min(Math.max(1,requestedPage),pages);
    const offset = (page-1)*limit;

    const reviewsResult = await query(
      `SELECT id,rating,comment,createat AS "createdAt".
        CASE
          WHEN $2 IS NULL THEN FALSE
          ELSE buyerid = $2
        END AS "isMine"
      FROM "Review"
      WHERE productid = $1 ORDER BY createdat DESC, id DESC LIMIT $3 OFFSET $4`
    [productId,buyerId || null, limit,offset]
    );

    return {
      reviews: reviewsResult.rows,
      page,
      pages,
      reviewCount,
      averageRating: averageResult.rows[0].average,
      canReview: eligible,
      myReview : myReviewResult.rows[0] || null,
    };
}

async function saveReview({productId,buyerId,rating,comment}) {
  const result = await query(
    `INSERT INTO "Review" (productid,buyerid,rating,comment)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (productid,buyerid)
     DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updatedat = NOW()
     RETURNING id,rating,comment,createdat AS "createdAt"
    `,
    [productId,buyerId,rating,comment]
  );
  return result.rows[0];
}

async function deleteReview(productId,buyerId) {
  const result = await query(`
    DELETE FROM "Review" WHERE productid = $1 AND buyerid = $2
    RETURNING id
    `,[productId,buyerId]) ;
    return result.rows.length > 0; 
}


module.exports = { getAll, getById, getBySellerId, create, update, remove, getReviews, canReview,saveReview,deleteReview };
