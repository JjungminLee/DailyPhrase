# Ollama GPU acceleration / Ollama GPU 가속

## Windows: Intel integrated GPUs

Ollama may detect an Intel Arc integrated GPU but leave it unused by default. In that case `ollama ps` reports `100% CPU`; this describes where the model is running, not the current CPU utilization.

Enable Ollama's integrated GPU support in PowerShell:

```powershell
setx OLLAMA_IGPU_ENABLE 1
```

Then fully quit Ollama from the system tray and start it again so its server inherits the new setting. Stop a loaded model before testing if needed:

```powershell
ollama stop qwen3.5:4b
ollama ps
```

Open an article in Daily Phrase to trigger inference, then run `ollama ps` again while the request is active. Check `%LOCALAPPDATA%\Ollama\server.log` for GPU discovery and inference-compute lines. The previous `dropping integrated GPU; to enable, set OLLAMA_IGPU_ENABLE=1` line should no longer appear. GPU offload can reduce CPU use and improve latency, but actual speed depends on the GPU, driver, model size, and available shared memory.

This is an Ollama server setting, not a Daily Phrase `.env` value. The app cannot enable GPU offload through its model API requests.

## Windows: Intel 내장 GPU

Ollama가 Intel Arc 내장 GPU를 발견하고도 기본값으로 사용하지 않을 수 있습니다. 이때 `ollama ps`의 `100% CPU`는 모델 실행 장치가 CPU라는 뜻이며, CPU가 현재 100% 바쁘다는 뜻은 아닙니다.

PowerShell에서 Ollama의 내장 GPU 사용을 허용합니다.

```powershell
setx OLLAMA_IGPU_ENABLE 1
```

새 설정이 적용되도록 시스템 트레이에서 Ollama를 완전히 종료한 다음 다시 실행합니다. 필요하면 모델을 내린 뒤 추론 중에 확인합니다.

```powershell
ollama stop qwen3.5:4b
ollama ps
```

Daily Phrase에서 아티클을 열어 모델 추론을 시작하고, 요청 중 `ollama ps`를 다시 실행합니다. `%LOCALAPPDATA%\Ollama\server.log`의 GPU 발견 및 추론 장치 로그도 확인하세요. 이전에 기록되던 `dropping integrated GPU; to enable, set OLLAMA_IGPU_ENABLE=1` 메시지가 사라져야 합니다. GPU 사용은 CPU 부하와 처리 시간을 줄일 수 있지만 실제 성능은 GPU, 드라이버, 모델 크기, 공유 메모리 여유에 따라 달라집니다.

이 설정은 Daily Phrase의 `.env`가 아니라 Ollama 서버에 적용됩니다. 앱은 모델 API 요청만으로 GPU 사용을 켤 수 없습니다.
