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

function submitForm() {
  if (validation()) {
    _element.submit.value = 'Please Wait...'
    _element.submit.disabled = true
    google.script.run
      .withSuccessHandler(function(e) {
        _authToken = e.authToken
        _folderId = e.folderId
        var cnt = 0
        createFileReader(cnt)
      })
      .getAt(_element.name.value, _element.email.value, _element.serial.value)
  }
}

function createFileReader(cnt) {
  var i = cnt
  _filesInitializing = _element.progressContainer.childNodes.length
  _filesCompleted = _element.successContainer.childNodes.length
  if (_filesInitializing + _filesCompleted > 10) {
    setTimeout(function() {
      createFileReader(i)
    }, 200)
  } else {
    var progressElement = document.createElement('div')
    var fr = new FileReader()
    fr.fileSize = _files[i].size
    fr.fileName = _files[i].name
    fr.fileType = _files[i].type
    fr.readAsArrayBuffer(_files[i])
    fr.onload = function() {
      xhrPost(
        this.fileSize,
        this.fileName,
        this.fileType,
        this.result,
        progressElement,
      )
    }
    progressElement.className = 'uploadProgress'
    progressElement.innerHTML = 'Initializing... ' + _files[i].name
    _element.progressContainer.insertBefore(
      progressElement,
      _element.progressContainer.childNodes[0],
    )
    i += 1
    if (i < _files.length) {
      createFileReader(i)
    }
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
  var xhrChunk = new XMLHttpRequest()
  xhrChunk.open('PUT', location, true)
  xhrChunk.setRequestHeader('Content-Range', chunks[n].range)
  xhrChunk.send(chunks[n].data)
  xhrChunk.onloadend = function() {
    n += 1
    progressElement.innerHTML =
      'Uploading: ' +
      parseFloat((100 * n) / chunks.length).toFixed(1) +
      '%... ' +
      fileName
    if (xhrChunk.status == 308) {
      xhrPut(fileName, location, chunks, n, progressElement)
    } else if (xhrChunk.status == 200) {
      _element.successContainer.insertBefore(
        progressElement,
        _element.successContainer.childNodes[0],
      )
      progressElement.classList.add('greentext')
      progressElement.innerHTML = 'Upload Succeeded... ' + fileName
      setTimeout(function() {
        _element.successContainer.removeChild(progressElement)
      }, 1000)
      formReset()
    } else {
      _element.successContainer.insertBefore(
        progressElement,
        _element.successContainer.childNodes[0],
      )
      progressElement.classList.add('redtext')
      progressElement.innerHTML = 'Error ' + xhrChunk.response
      setTimeout(function() {
        _element.successContainer.removeChild(progressElement)
      }, 1000)
      formReset()
    }
  }
}

function formReset() {
  if (!_element.progressContainer.hasChildNodes()) {
    _element.form.reset()
    _element.submit.disabled = false
    _element.submit.value = 'Submit'
  }
}

function getChunkpot(fileSize) {
  var chunkPot = {}
  chunkPot.total = fileSize
  chunkPot.chunks = []
  if (fileSize > _chunkSize) {
    var numE = _chunkSize
    var endS = (function(f, n) {
      var c = f % n
      if (c == 0) {
        return 0
      } else {
        return c
      }
    })(fileSize, numE)
    var repeat = Math.floor(fileSize / numE)
    for (var i = 0; i <= repeat; i++) {
      var startAddress = i * numE
      var c = {}
      c.startByte = startAddress
      if (i < repeat) {
        c.endByte = startAddress + numE - 1
        c.numByte = numE
        chunkPot.chunks.push(c)
      } else if (i == repeat && endS > 0) {
        c.endByte = startAddress + endS - 1
        c.numByte = endS
        chunkPot.chunks.push(c)
      }
    }
  } else {
    var chunk = {
      startByte: 0,
      endByte: fileSize - 1,
      numByte: fileSize,
    }
    chunkPot.chunks.push(chunk)
  }
  return chunkPot
}

function validation() {
  var emailReg = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/i
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
