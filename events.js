startBtn.addEventListener('click', function() {
    isActive = !isActive;
    if (isActive) {
        renderAbc();
        startBtn.classList.add('active');
    } else {
        startBtn.classList.remove('active');
    }
});

saveBtn.addEventListener('click', function() {
    if (isSaving) return;
    saveBtn.classList.add('active');
    isSaving = true;

    let abcString = abcCode.value.split("\n *").join("\n");
    if (abcString.length > 0) {
        fetch('/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain'   // 告诉服务器发送的是纯文本
            },
            body: abcString
        })
        .then(response => {
            if (response.ok) {
                alert('文件已保存');
            } else {
                alert('保存失败');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('保存出错');
        })
        .finally(() => {
            saveBtn.classList.remove('active');
            isSaving = false;
        });
    } else {
        saveBtn.classList.remove('active');
        isSaving = false;
    }
});


abcCode.addEventListener('input', function() {
    if (!isActive) return;
    renderAbc();
});

