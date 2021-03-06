const app = require('./bootstrap');
const crypto = require('crypto');
const config = require('./config');
const Post = require('./post');
const mime = require('mime/lite');
const mmmagic = require('mmmagic');
const sharp = require('sharp');
const sanitizeHtml = require('sanitize-html');

const libmagic = new mmmagic.Magic(mmmagic.MAGIC_MIME_TYPE);

app.get('/', function (req, res) {
    res.render('index');
});

app.post('/save', function(req, res){
    const disallowAll = { allowedTags: [], allowedAttributes: [] };

    req.body.title = sanitizeHtml(req.body.title, disallowAll);
    req.body.author = sanitizeHtml(req.body.author, disallowAll);
    req.body.story = sanitizeHtml(req.body.story, {
        allowedTags: Post.defaults.allowedTags,
        allowedAttributes: Post.defaults.allowedAttributes
    });

    if (req.body.code) 
    {
        req.body.code = sanitizeHtml(req.body.code, disallowAll);

        Post.findByCode(req.body.code, function(error, post){
            if (error) {
                console.log(error);
                res.sendStatus(400);
            } else if (!post.editable(req.userId)) {
                res.sendStatus(403);
            } else {
                post.title = req.body.title;
                post.author = req.body.author;
                post.story = req.body.story;
                post.delta = req.body.delta;

                post.update(function(error, updatedPost){
                    if (error) {
                        console.log(error);
                        res.sendStatus(400);
                    } else {
                        res.json({
                            code: updatedPost.code,
                            slug: updatedPost.slug,
                            url: updatedPost.url
                        });
                    }
                });
            }
        });
    }
    else
    {
        const post = new Post({
            title: req.body.title,
            author: req.body.author,
            story: req.body.story,
            delta: req.body.delta,
            userId: req.userId
        });
        post.add(function(error, newPost){
            if (error) {
                console.log(error);
                res.sendStatus(400);
            } else {
                res.json({
                    code: newPost.code,
                    slug: newPost.slug,
                    url: newPost.url
                });
            }
        });
    }
});

app.post('/upload', function(req, res){
    if (!req.files) {
        return res.sendStatus(400);
    }

    const file = req.files.file;
    if (!file || !file.data) {
        return res.sendStatus(400);
    }

    libmagic.detect(file.data, function(error, realMimetype){
        if (error) {
            return res.sendStatus(400);
        } else {
            if (realMimetype.indexOf('image/') != 0) {
                return res.sendStatus(400);
            }

            const ext = mime.getExtension(realMimetype);
            if (!ext) {
                return res.sendStatus(400);
            }

            const fileName = crypto.pseudoRandomBytes( config.fileNameLen / 2 ).toString('hex') + '.' + ext;

            const serverPath = './server/upload/' + fileName;
            const publicPath = req.rootUrl + '/file/' + fileName;

            sharp(file.data)
                .resize(config.fileMaxWidth, null)
                .withoutEnlargement()
                .toFile(serverPath, function(error, info){
                    if (error) {
                        return res.sendStatus(500);
                    } else {
                        info.path = publicPath;
                        return res.json({
                            path: publicPath,
                            width: info.width,
                            height: info.height,
                            size: info.size
                        });
                    }
                });
        }
    });
});

app.get('/:slug', function(req, res, next){
    Post.findBySlug(req.params.slug, function(error, post){
        if (post) {
            post.absUrl = req.rootUrl + post.url;
            post.absAmpUrl = req.rootUrl + post.ampUrl;
            
            res.render('post', {
                post: post, 
                canEdit: post.editable(req.userId),
                title: post.title
            });
        } else {
            next();
        }
    });
});

app.get('/:slug/edit', function(req, res,  next){
    Post.findBySlug(req.params.slug, function(error, post){
        if (post) {
            if (post.editable(req.userId)) {
                res.render('post_edit', {post: post, title: post.title});
            } else {
                res.redirect(post.url);
            }
        } else {
            next();
        }
    });
});

app.get('/:slug/amp', function(req, res, next){
    Post.findBySlug(req.params.slug, function(error, post){
        if (post) {
            post.absUrl = req.rootUrl + post.url;
            post.storyAmp = post.storyAmp.replace(
                /%amp_iframe_placeholder_src%/g,
                req.rootUrl + config.ampIframePlaceholder
            );
            res.render('post_amp', {
                post: post, 
                canEdit: post.editable(req.userId),
                title: post.title
            });
        } else {
            next();
        }
    });
});

app.use(function(req, res) {
    res.status(404).render('404');
});

app.use(function(err, req, res, _next) {
    res.status(503).render('service_unavailable');
});  

module.exports = app;