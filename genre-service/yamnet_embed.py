"""YAMNet model that also exposes the 1024-dim pooled embedding layer."""
import tensorflow as tf
from tensorflow.keras import Model, layers
import features as features_lib
import params
from yamnet import _conv, _separable_conv, _YAMNET_LAYER_DEFS


def yamnet_with_embedding(features):
    net = layers.Reshape(
        (params.PATCH_FRAMES, params.PATCH_BANDS, 1),
        input_shape=(params.PATCH_FRAMES, params.PATCH_BANDS))(features)
    for (i, (layer_fun, kernel, stride, filters)) in enumerate(_YAMNET_LAYER_DEFS):
        net = layer_fun('layer{}'.format(i + 1), kernel, stride, filters)(net)
    embedding = layers.GlobalAveragePooling2D()(net)
    logits = layers.Dense(units=params.NUM_CLASSES, use_bias=True)(embedding)
    predictions = layers.Activation(
        name=params.EXAMPLE_PREDICTIONS_LAYER_NAME,
        activation=params.CLASSIFIER_ACTIVATION)(logits)
    return predictions, embedding


def yamnet_frames_model_with_embedding(feature_params):
    waveform = layers.Input(batch_shape=(1, None))
    spectrogram = features_lib.waveform_to_log_mel_spectrogram(
        tf.squeeze(waveform, axis=0), feature_params)
    patches = features_lib.spectrogram_to_patches(spectrogram, feature_params)
    predictions, embedding = yamnet_with_embedding(patches)
    frames_model = Model(name='yamnet_frames_embed',
                          inputs=waveform, outputs=[predictions, embedding, spectrogram])
    return frames_model
