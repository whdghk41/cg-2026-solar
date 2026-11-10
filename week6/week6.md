# 6주차 실습 1 시작 코드

이 시작 코드의 task1.js에 있는 TODO 1~5를 직접 채워 완성합니다.
처음에는 회색 큐브와 Phong 조명만 보입니다. TODO 2의 PBR 함수는 0을 반환합니다.
설정 스위치를 켜는 것으로 과제가 끝나지 않습니다. 코드를 작성해야 합니다.
Copilot 등 AI에게 각 TODO의 코드 제안을 받을 수 있지만 실행 결과와 수식의 연결을 스스로 확인하세요.
VS Code Live Server 또는 `python -m http.server`로 task1.html을 엽니다.

실습 2는 완성한 task1.html/js를 task2.html/js로 복사해서 시작하세요.
HTML의 script 경로도 task2.js로 수정합니다. 5주차 태양계 장면을 참고해
UV 구형 행성에 실습 1의 PBR·normal 계산을 적용하고, 태양 거리와 충돌 누적량
두 조건으로 바뀌는 표면 마스크를 코딩합니다. task2 예제에서는 두 조건을 각각
0–100으로 조절합니다. 태양 거리 조건은 행성의 공전 궤도 반경과 기후 얼음 마스크에,
충돌 누적량은 독립적인 분화구 마스크와 표면 재질에 연결됩니다. 표면 보기에서
0·50·100의 변화를 확인하고, 기본/변화 비교와 마스크 1·2 진단 보기로 결과를 비교합니다.

텍스처: Poly Haven CC0 (https://polyhaven.com/license).
assets/week06/sources.json에 각 파일 출처가 있습니다. 환경 이미지는 LDR 미리보기입니다.
