var gd = require("node-gd"),
    fs = require("fs"),
    buffertools = require('buffertools')

module.exports = exports = Object.create(gd)

function gdError(error, message) {
    var e = new Error(message)
    e.error = error
    return e
}

function cap(string) {
    return string.charAt(0).toUpperCase() + string.slice(1)
}

var formats = {
    jpeg: {ext: '.jpg', method: 'jpeg', ptrextra: 'jpegquality', signature: new Buffer([0xff, 0xd8, 0xff])},
    png:  {ext: '.png', method: 'png',  ptrextra: 'pnglevel',    signature: new Buffer([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])},
    gif:  {ext: '.gif', method: 'gif',                           signature: new Buffer('GIF')},
}

function checkFormat (format) {
    if (!format) throw gdError('format_required', 'Image format required')
    if (!format in formats) throw gdError('unknown_format', 'Unknown format ' + format)
    return formats[format]
}

exports.imageFormat = function(buffer) {
    var name, signature
    for (name in formats) {
        signature = formats[name].signature
        if (buffer.slice(0, signature.length).equals(signature))
            return name
    }
    throw gdError('unknown_format', 'Unknown image format')
}

exports.createFromPtr = function(buffer) {
    var format, image
    format = exports.imageFormat(buffer)
    image = gd['createFrom' + cap(formats[format].method) + 'Ptr'](buffer)
    if (!image) throw gdError('open', 'Failed to create image from buffer')
    image.format = format
    return image
}

exports.open = function(path, callback) {
    fs.readFile(path, function(err, data) {
        if (err) return callback(gdError('read', err))
        try {
            callback(null, exports.createFromPtr(data))
        } catch (e) {
            callback(e)
        }
    })
}

gd.Image.prototype.ptr = function(options) {
    var format, method, args, data
    options = options || {}
    format = checkFormat(options.format || this.format || options.defaultFormat)

    method = this[format.method + 'Ptr']
    args = 'ptrextra' in format ? [options[format.ptrextra] || -1] : []
    data = method.apply(this, args)

    return new Buffer(data, 'binary')
}

gd.Image.prototype.resized = function(options) {
    var rw, rh, rr,
        sw, sh, sr, sx, sy,
        tw, th, tr,
        target

    if (rw > this.width && rh > this.height)
        return this

    rw = options.width || 10000
    rh = options.height || 10000
    rr = rw / rh
    sr = this.width / this.height

    if (options['method'] === 'crop') {
        tw = Math.min(rw, this.width)
        th = Math.min(rh, this.height)
        tr = tw / th
        if (sr >= rr) {
            sh = this.height
            sw = Math.floor(sh * tScale)
            sy = 0
            sx = Math.floor((this.width - sw) / 2)
        } else {
            sw = this.width
            sh = Math.floor(sw / tScale)
            sx = 0
            sy = Math.floor((this.height - sh) / 2)
        }
    } else {
        sx = sy = 0
        sw = this.width
        sh = this.height
        if (sr >= rr) {
            tw = Math.min(rw, this.width)
            th = Math.floor(tw / sr)
        } else {
            th = Math.min(rh, this.height)
            tw = Math.floor(th * sr)
        }
    }

    target = gd.createTrueColor(tw, th)
    target.format = options.format || this.format
    checkFormat(target.format)

    target.saveAlpha(1)
    target.alphaBlending(target.format === 'jpeg' ? 1 : 0)
    this.copyResampled(target, 0, 0, sx, sy, tw, th, sw, sh)

    return target
}

gd.Image.prototype.resizedPtr = function(options) {
    return this.resized(options).ptr(options);
}

gd.Image.prototype.watermark = function(wm, pos) {
    var x = (this.width - wm.width) * pos.x,
        y = (this.height - wm.height) * pos.y
    wm.copy(this, x, y, 0, 0, wm.width, wm.height)
    return this
}
