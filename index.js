var
    http = require('http'),
    fs = require('fs'),
    formidable = require('formidable'),
    sweet = require('sweet'),
    gd = require('./lib/node-gd-extended'),
    async = require('async'),
    tar = require('tar-async'),
    stream = require('stream')

var server = http.createServer(function (req, res) {
    if (req.method === 'POST')
        async.waterfall([
            loadWatermarks,
            async.apply(parseForm, req),
            processImages,
            buildDownload,
            async.apply(sendDownload, res)
        ])
    else
        async.waterfall([
            loadWatermarks,
            async.apply(serveUploadForm, res)
        ])
})

server.listen(8600)

function loadWatermarks (callback) {
    var path = __dirname + '/watermarks/',
        watermarks = {}
    fs.readdir(path, function(err, files){
        async.each(files, function(file, callback){
            gd.open(path + file, function(err, image){
                watermarks[file] = image
                callback(err)
            })
        }, function(err){
            callback(err, watermarks)
        })
    })
}
loadWatermarks = async.memoize(loadWatermarks)

function serveUploadForm (res, watermarks, callback) {
    res.writeHead(200, {"Content-Type": "text/html; charset=utf-8"})
    res.write(
        '<form method="post" enctype="multipart/form-data" accept-charset="utf-8">' +
            '<select name="size">' +
                '<option>1000x1000</option><option>600x600</option><option>Как есть</option>' +
            '</select>' +
            '<select name="watermark">' +
                Object.keys(watermarks).sort().map(function(f){return '<option>' + f + '</option>'}).join('') +
                '<option>Без логотипа</option>' +
            '</select>' +
            '<select name="watermark_position">' +
                '<option value="right">Логотип справа</option><option value="left">Логотип слева</option>' +
            '</select>' +
            '<input type="file" name="file" multiple="multiple" onchange="this.form.submit(); this.value=null">' +
        '</form>'
    )
    res.end()
}

function parseForm (req, watermarks, callback) {
    var sizes = {
            '1000x1000': {width:1000, height:1000},
            '600x600':   {width:600, height:600},
        },
        positions = {
            'left':  {x:0, y:1},
            'right': {x:1, y:1},
        }
    parsePostRequest(req, function(err, fields, files){
        if (err) callback(err)
        else callback(null,
            files,
            sizes[fields['size']],
            watermarks[fields['watermark']],
            positions[fields['watermark_position']] || positions['right']
        )
    })
}

function processImages (files, size, watermark, watermark_position, callback) {
    async.map(files, function(file, callback){
        var image
        try {
            image = gd.createFromPtr(file.data)
            if (size)
                image = image.resized(size)
            if (watermark && watermark_position)
                image = image.watermark(watermark, watermark_position)
            image = image.ptr({format: 'jpeg', 'jpegquality': 90})
            callback(null, {name: file.name, data: image})
        } catch(err) {
            callback(err)
        }
    }, callback)
}

function buildDownload (files, callback) {
    var filename, buffer, tape
    if (files.length === 1) {
        callback(null, 'processed-' + files[0].name, files[0].data)
    } else {
        buffer = new WriteableBuffer()
        buffer.on('data_written', function(data){
            callback(null, 'processed.tar', data)
        })
        tape = new tar({output: buffer})
        async.eachSeries(files, function(file, callback){
            tape.append(file.name, file.data, callback)
        }, function(err) {
            tape.close()
        })
    }
}

function sendDownload (res, filename, data, callback) {
    var disposition_value = sweet.make_disposition('attachment', filename, transliterate(filename))
    res.writeHead(200, {
        "Content-Type": 'application/download',
        "Content-Disposition": disposition_value,
    })
    res.write(data)
    res.end()
    callback(null)
}

function parsePostRequest(req, callback) {
    var form = new formidable.IncomingForm(),
        files = []

    form.onPart = function(part) {
        var file
        if (part.filename) {
            file = {name: part.filename, data: new Buffer(0)}
            part.on('data', function(buffer) {
                file.data = Buffer.concat([file.data, buffer])
            })
            part.on('end',  function() {form._maybeEnd()})
            files.push(file)
        } else
            form.handlePart(part)
    }

    form.parse(req, function(err, fields) {
        callback(err, fields, files)
    })
}

function WriteableBuffer() {
    var data = new Buffer(0),
        s = new stream.PassThrough()
    s.on('readable', function(){
        data = Buffer.concat([data, s.read()])
    })
    s.on('end', function(){
        s.emit('data_written', data)
    })
    return s
}

function transliterate(cyrillyc_string) {
    var charmap = require('translit-russian')
    return cyrillyc_string.split('').map(function (c) {return charmap[c] || c}).join('')
}
