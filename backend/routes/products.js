const express = require('express');
const productController = require('../controllers/productController');
const { requireAuth } = require('../middleware/auth');
const {query} = require('../db');
const router = express.Router();

router.get('/', productController.list);
router.get('/my', requireAuth, productController.myProducts);
router.get('/:id', productController.getById);
router.post('/', requireAuth, productController.create);
router.put('/:id', requireAuth, productController.update);
router.delete('/:id', requireAuth, productController.remove);

async function hasReceivedProduct(productId,buyerId){
  const r = await query(
    `SELECT 1 FROM "Order" WHERE product=$1 AND buyerid = $2 AND status IN ('delivered','completed') LIMIT 1`,
    [productId,buyerId]
  );
  return r.rowCount > 0;
}

router.get("/:productId/reviews",optionalAuth,async (req,res)=>{
  try{
    const productId = parseInt(req.params.productId,10);
    if(isNaN(productId)) return res.status(400).json({error:'Invalid product id'});
    const page = Math.max(1,parseInt(req.query.page,10)||1);
  }
})

module.exports = router;
