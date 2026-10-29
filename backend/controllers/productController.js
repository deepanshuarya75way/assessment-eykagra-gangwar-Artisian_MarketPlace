const productService = require('../services/productService');
const { moderateText } = require('../services/moderationService');

async function list(req, res) {
  try {
    const products = await productService.getAll();
    res.json(products);
  } catch (err) {
    console.error('Products list error:', err);
    res.status(500).json({ error: 'Failed to list products' });
  }
}

async function myProducts(req, res) {
  try {
    const sellerId = req.user?.userId;
    if (!sellerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const products = await productService.getBySellerId(sellerId);
    res.json(products);
  } catch (err) {
    console.error('My products error:', err);
    res.status(500).json({ error: 'Failed to list your products' });
  }
}

async function getById(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid product id' });
    }
    const product = await productService.getById(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    console.error('Product get error:', err);
    res.status(500).json({ error: 'Failed to get product' });
  }
}

async function create(req, res) {
  try {
    const { title, description, price, category, imageUrl } = req.body;
    const sellerId = req.user?.userId;
    if (!sellerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!title || description == null || price == null || !category) {
      return res.status(400).json({ error: 'title, description, price, and category are required' });
    }

    const modResult = await moderateText({ title, description: String(description), category: String(category) });
    if (!modResult.allowed) {
      return res.status(422).json({
        error: 'Listing rejected by content moderation',
        reason: modResult.reason,
      });
    }

    const { stock } = req.body;
    const product = await productService.create({
      title,
      description: String(description),
      price: parseFloat(price),
      category: String(category),
      imageUrl: imageUrl || null,
      sellerId,
      stock: stock != null ? Math.max(1, parseInt(stock, 10) || 1) : 1,
    });
    res.status(201).json(product);
  } catch (err) {
    console.error('Product create error:', err);
    res.status(500).json({ error: 'Failed to create product' });
  }
}

async function update(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const sellerId = req.user?.userId;
    if (!sellerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid product id' });
    }
    const { title, description, price, category, imageUrl, stock } = req.body;
    if (!title || description == null || price == null || !category) {
      return res.status(400).json({ error: 'title, description, price, and category are required' });
    }

    const modResult = await moderateText({ title, description: String(description), category: String(category) });
    if (!modResult.allowed) {
      return res.status(422).json({
        error: 'Listing rejected by content moderation',
        reason: modResult.reason,
      });
    }

    const product = await productService.update(id, sellerId, {
      title: String(title),
      description: String(description),
      price: parseFloat(price),
      category: String(category),
      imageUrl: imageUrl || null,
      stock: stock != null ? Math.max(1, parseInt(stock, 10) || 1) : 1,
    });
    if (!product) {
      return res.status(404).json({ error: 'Product not found or you do not own it' });
    }
    res.json(product);
  } catch (err) {
    console.error('Product update error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
}

async function remove(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const sellerId = req.user?.userId;
    if (!sellerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid product id' });
    }
    const deleted = await productService.remove(id, sellerId);
    if (!deleted) {
      return res.status(404).json({ error: 'Product not found or you do not own it' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('Product delete error:', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
}

async function listReviews(req,res) {
  try {
    const productId = parseInt(req.params.id,10);
    if(!Number.isInteger(productId) || productId < 1){
      return res.status(400).json({error:"Invalid product id"});
    }
    const product = await productService.getById(productId);
    if(!product){
      return res.status(404).json({error:"Product not found"});
    }
    const page = Math.max(1,parseInt(req.query.page,10) || 1);
    const result = await productService.getReviews(
      productId,
      req.user?.userId || null, 
      page
    );
    res.json(result);
  }
  catch(err){
    console.log("List reviews error: ",err);
    res.status(500).json({error:'Failed to load reviews'});
  }
}


async function saveReview(req,res) {
  try{
    const productId = parseInt(req.params.id,10);
    const buyerId = req.user?.userId;
    const {rating,comment} = req.body || {};

    if(!Number.isInteger(productId) || productId < 1){
      return res.status(400).json({error:"Invalid product id"});
    }

    const numericRating = Number(rating);
    if(!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5){
      return res.status(400).json({error:"Rating must be a whole number from 1 to 5"});
    }
    if(typeof comment !=='string' || !comment.trim() || comment.trim().length > 2000){
      return res.status(400).json({error: 'Comment is required and must be 2000 characters or less.'});
    }
    const product = await productService.getById(productId);
    if(!product){
      return res.status(404).json({error: 'Prodoct not found'});
    }
    if(!(await productService.canReview(productId,buyerId))){
      return res.status(403).json({
        error: 'Only a buyer with a delivered order for this product can review it.'
      });
    }

    const review = await productService.saveReview({
      productId,
      buyerId,
      rating: numericRating,
      comment: comment.trim(),
    });

    res.json(review);
  }
  catch(err){
    console.error("Save review error:",err);
    res.status(500).json({error:'Failed to save review'});
  }
}

async function removeReview(req,res){
  try{
    const productId = parseInt(req.params.id,10);
    if(!Number.isInteger(productId) || productId < 1){
      return res.status(400).json({error: 'Invalid product id'});
    }
    const deleted = await productService.deleteReview(productId,req.user.userId);
    if(!deleted){
      return res.status(404).json({error: 'Your review was not found'});
    }

    res.status(204).send();
  }
  catch(err){
    console.error('Delete review error:', err);
    res.status(500).json({error:'Failed to delete review'});
  }
}

module.exports = { list, myProducts, getById, create, update, remove, listReviews, saveReview, removeReview };
