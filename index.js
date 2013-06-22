var
    http = require('http'),
    url = require('url'),
    sys = require('sys'),
    formidable = require('formidable'),
    sweet = require('sweet'),
    util = require('util'),
    gd = require('./lib/node-gd-extended')


var server = http.createServer(function (req, res) {
    if (req.method === 'POST') {
        var form = new formidable.IncomingForm()

        parseUploadRequest(req, function(err, fields, files) {
            var filename = 'R-' + files[0].name,
                cd = sweet.make_disposition('attachment', filename, transliterate(filename))
                res.writeHead(200, {
                    "Content-Disposition": cd,
                    "Content-Type": 'application/download',
                })

                var wm = gd.open(__dirname + '/watermarks/ruauto-light.png')
                var img = gd.createFromPtr(files[0].data)

                res.write(img.resized({width:1000, height:1000}).watermark(wm, {x:0, y:1}).ptr())
                res.end()
        })
    } else
        serveUploadForm(req, res)
})

server.listen(8600)

function serveUploadForm(req, res) {
    res.writeHead(200, {"Content-Type": "text/html"})
    res.write(
        '<form method="post" enctype="multipart/form-data" accept-charset="utf-8">' +
        '<input type="file" name="file" onchange="this.form.submit(); this.value=null">' +
        '</form>'
    )
    res.end()
}

function parseUploadRequest(req, cb) {
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
        cb(false, fields, files)
    })
}

function transliterate(cyrillyc_string) {
    var charmap = require('translit-russian')
    return cyrillyc_string.split('').map(function (c) {return charmap[c] || c}).join('')
}
