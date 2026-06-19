import sys
sys.path.insert(0, '.')
from agents.trainer import TrainingLoop

trainer = TrainingLoop(
    vocab_size=10, message_length=3, hidden_dim=128,
    feature_dim=4, num_objects=5, learning_rate=0.001,
    game_type="referential"
)

import asyncio

async def test():
    result = await trainer.train(
        num_episodes=20,
        log_interval=5,
    )
    print("Result:", result)

asyncio.run(test())
