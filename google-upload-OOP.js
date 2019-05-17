var _element = {
  form: document.getElementById('form'),
  name: document.getElementById('name'),
  email: document.getElementById('email'),
  serial: document.getElementById('serial'),
  files: document.getElementById('files'),
  submit: document.getElementById('submit'),
  snackbar: document.getElementById('snackbar'),
  progressContainer: document.getElementById('progressContainer'),
  successContainer: document.getElementById('successContainer'),
}
var _chunkSize = 262144
var _filesInitializing
var _files = _element.files.files
var _authToken
var _folderId

// eslint-disable-next-line no-unused-vars
function submitForm() {
  if (validation()) {
    _element.submit.value = 'Please Wait...'
    _element.submit.disabled = true
    // eslint-disable-next-line no-undef
    google.script.run
      .withSuccessHandler(function(e) {
        _authToken = e.authToken
        _folderId = e.folderId
        var cnt = 0
        var timeUploadBegan = Date.now()
        rateLimiter(cnt, timeUploadBegan)
      })
      .getAt(_element.name.value, _element.email.value, _element.serial.value)
  }
}

var rateLimiter = function(cnt, timeUploadBegan) {
  var timeNow = Date.now()
  var averageUploadSpeed = (timeNow - timeUploadBegan) / cnt
  _filesInitializing = _element.progressContainer.childNodes.length
  if (averageUploadSpeed < 150 || _filesInitializing > 6) {
    setTimeout(function() {
      rateLimiter(cnt, timeUploadBegan)
    }, 150)
  } else if (cnt < _files.length) {
    var progressElement = new ProgressElement()
    progressElement.attachToProgressContainer()
    fileProcessor(cnt, progressElement)
    cnt += 1
    rateLimiter(cnt, timeUploadBegan)
  } else {
    formReset()
  }
}

function ProgressElement() {
  var progressElement = document.createElement('div')
  this.setInnerHTML = {
    initializing: function(fileName) {
      progressElement.innerHTML = 'Initializing... ' + fileName
    },
    uploading: function(fileName, n, chunks) {
      progressElement.innerHTML =
        'Uploading: ' +
        parseFloat((100 * n) / chunks.length).toFixed(1) +
        '%... ' +
        fileName
    },
    uploaded: function(fileName) {
      progressElement.innerHTML = 'Upload Succeeded... ' + fileName
    },
    error: function(response) {
      progressElement.innerHTML = 'Error ' + response
    },
  }
  this.attachToProgressContainer = function() {
    _element.progressContainer.insertBefore(
      progressElement,
      _element.progressContainer.childNodes[0],
    )
  }
  this.attachToSuccessContainer = function(className) {
    _element.successContainer.insertBefore(
      progressElement,
      _element.successContainer.childNodes[0],
    )
    progressElement.classList.add(className)
    setTimeout(function() {
      _element.successContainer.removeChild(progressElement)
    }, 1000)
  }
}

function fileProcessor(cnt, progressElement) {
  // eslint-disable-next-line no-undef
  var fr = new FileReader()
  fr.fileSize = _files[cnt].size
  fr.fileName = _files[cnt].name
  fr.fileType = _files[cnt].type
  fr.readAsArrayBuffer(_files[cnt])
  fr.onload = async function() {
    progressElement.setInnerHTML.initializing(this.fileName)
    xhrPost(
      this.fileSize,
      this.fileName,
      this.fileType,
      this.result,
      progressElement,
    )
  }
}

function xhrPost(fileSize, fileName, fileType, result, progressElement) {
  var chunkpot = getChunkpot(fileSize)
  var uint8Array = new Uint8Array(result)
  var chunks = chunkpot.chunks.map(function(e) {
    return {
      data: uint8Array.slice(e.startByte, e.endByte + 1),
      length: e.numByte,
      range: 'bytes ' + e.startByte + '-' + e.endByte + '/' + chunkpot.total,
    }
  })
  // eslint-disable-next-line no-undef
  var xhr = new XMLHttpRequest()
  xhr.open(
    'POST',
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
  )
  xhr.setRequestHeader('Authorization', 'Bearer ' + _authToken)
  xhr.setRequestHeader('Content-Type', 'application/json')
  xhr.send(
    JSON.stringify({
      mimeType: fileType,
      name: fileName,
      parents: [_folderId],
    }),
  )
  xhr.onload = function() {
    var location = xhr.getResponseHeader('location')
    var cnt = 0
    xhrPut(fileName, location, chunks, cnt, progressElement)
  }
  xhr.onerror = function() {
    M.toast({
      html: 'Error' + xhr.response,
      classes: 'toast, redtext',
      displayLength: 2000,
    })
  }
}

function xhrPut(fileName, location, chunks, cnt, progressElement) {
  var n = cnt
  // eslint-disable-next-line no-undef
  var xhrChunk = new XMLHttpRequest()
  xhrChunk.open('PUT', location, true)
  xhrChunk.setRequestHeader('Content-Range', chunks[n].range)
  xhrChunk.send(chunks[n].data)
  xhrChunk.onloadend = function() {
    if (xhrChunk.status === 308) {
      n++
      progressElement.setInnerHTML.uploading(fileName, n, chunks)
      xhrPut(fileName, location, chunks, n, progressElement)
    } else if (xhrChunk.status === 200) {
      progressElement.setInnerHTML.uploaded(fileName)
      progressElement.attachToSuccessContainer('greentext')
    } else {
      progressElement.setInnerHTML.error(xhrChunk.response)
      progressElement.attachToSuccessContainer('redtext')
    }
  }
}

function formReset() {
  _element.form.reset()
  _element.submit.disabled = false
  _element.submit.value = 'Submit'
}

function getChunkpot(fileSize) {
  var chunkPot = {}
  var chunk = {}
  chunkPot.total = fileSize
  chunkPot.chunks = []
  if (fileSize > _chunkSize) {
    var repeat = Math.floor(fileSize / _chunkSize)
    var endS = (function(f, n) {
      var c = f % n
      return c === 0 ? 0 : c
    })(fileSize, _chunkSize)
    for (var i = 0; i <= repeat; i++) {
      var startAddress = i * _chunkSize
      chunk.startByte = startAddress
      if (i < repeat) {
        chunk.endByte = startAddress + _chunkSize - 1
        chunk.numByte = _chunkSize
        chunkPot.chunks.push(chunk)
      } else if (i === repeat && endS > 0) {
        chunk.endByte = startAddress + endS - 1
        chunk.numByte = endS
        chunkPot.chunks.push(chunk)
      }
    }
  } else {
    chunk = {
      startByte: 0,
      endByte: fileSize - 1,
      numByte: fileSize,
    }
    chunkPot.chunks.push(chunk)
  }
  return chunkPot
}

function validation() {
  var emailReg = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/i
  if (
    _element.name.value === '' ||
    _element.email.value === '' ||
    _element.serial.value === ''
  ) {
    M.toast({
      html: 'All fields must be filled',
      classes: 'toast, redtext',
      displayLength: 2000,
    })
    return false
  } else if (!emailReg.test(_element.email.value)) {
    M.toast({
      html: 'Enter a valid email address',
      classes: 'toast, redtext',
      displayLength: 2000,
    })
    return false
  } else if (_files.length === 0) {
    M.toast({
      html: 'Please select a file to upload',
      classes: 'toast, redtext',
      displayLength: 2000,
    })
    return false
  } else {
    return true
  }
}
